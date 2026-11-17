import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const STATUS = {
  not_installed: { label: '未安装', cls: 'text-ink-faint' },
  crawling: { label: '抓取文档中…', cls: 'text-cinnabar' },
  indexing: { label: '建索引中…', cls: 'text-cinnabar' },
  tree: { label: '生成技能树…', cls: 'text-cinnabar' },
  ready: { label: '就绪', cls: 'text-pine' },
  error: { label: '失败', cls: 'text-cinnabar-deep' },
};
const ACTIVE = new Set(['crawling', 'indexing', 'tree']);

const cleanTitle = (t) => t.replace(/^模块[一二三四五六七八九十\d]+[：:·\s]*/, '');

function ProgressBar({ done, total }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-paper-deep overflow-hidden">
      <div className="h-full bg-pine transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function PackPanel({ onSelectPack, onResume, onRestart, onDetailChange, activePackId, session }) {
  const [packs, setPacks] = useState(null);
  const [detail, setDetail] = useState(null); // {id, log, tree, status, progress}
  const [expanded, setExpanded] = useState({}); // 模块折叠状态
  const [busy, setBusy] = useState(null);
  const timer = useRef(null);
  const currentRef = useRef(null);

  const refresh = async () => {
    try {
      const list = await api.get('/api/packs');
      setPacks(list);
      return list;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // 有安装中的包时轮询状态
  useEffect(() => {
    if (!packs) return;
    const active = packs.some((p) => ACTIVE.has(p.status));
    if (!active) return;
    timer.current = setInterval(async () => {
      const list = await refresh();
      if (list && !list.some((p) => ACTIVE.has(p.status))) clearInterval(timer.current);
    }, 3000);
    return () => clearInterval(timer.current);
  }, [packs]);

  // 详情页安装中时刷新日志/状态
  useEffect(() => {
    if (!detail || !ACTIVE.has(detail.status)) return;
    const t = setInterval(async () => {
      const d = await api.get(`/api/packs/${detail.id}`);
      setDetail({ id: detail.id, ...d });
    }, 3000);
    return () => clearInterval(t);
  }, [detail?.id, detail?.status]);

  // 打开书后把当前学习点滚到视野中间
  useEffect(() => {
    if (!detail?.tree) return;
    const t = setTimeout(() => currentRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
    return () => clearTimeout(t);
  }, [detail?.id]);

  // 当前正在学的包：用实时会话覆盖进度，做完一个点立刻亮 ✓
  const progOf = (p) => {
    if (p.id === activePackId && session && session.step && session.step !== 'none') {
      return {
        started: true,
        done: session.done_points || [],
        current: session.point_id,
        step: session.step,
        total: p.progress?.total ?? detail?.progress?.total ?? 0,
      };
    }
    return p.progress || { started: false, done: [], current: null, step: 'none', total: 0 };
  };

  const learnLabel = (prog) =>
    prog.started ? (prog.step === 'pack_done' ? '回顾' : '继续学习') : '开始学习';

  const install = async (id) => {
    setBusy(id);
    try {
      const r = await api.post(`/api/packs/${id}/install`);
      if (!r.ok) alert(r.error);
      await refresh();
    } catch (e) {
      alert(String(e.message || e));
    } finally {
      setBusy(null);
    }
  };

  const openDetail = async (id) => {
    const d = await api.get(`/api/packs/${id}`);
    const prog = d.progress || { done: [], current: null };
    // 默认展开：当前点所在模块 → 第一个未学完的模块 → 第一模块
    let openMi = 0;
    if (d.tree) {
      const doneSet = new Set(prog.done);
      const byCurrent = d.tree.modules.findIndex((m) =>
        m.sections.some((s) => s.points.some((p) => p.id === prog.current)));
      const byNext = d.tree.modules.findIndex((m) =>
        m.sections.some((s) => s.points.some((p) => !doneSet.has(p.id))));
      openMi = byCurrent >= 0 ? byCurrent : byNext >= 0 ? byNext : 0;
    }
    setExpanded({ [openMi]: true });
    setDetail({ id, ...d });
    onDetailChange?.(true);
  };

  const closeDetail = () => {
    setDetail(null);
    onDetailChange?.(false);
  };

  // ── 书页（详情）视图 ────────────────────────────────────────────────
  if (detail) {
    const meta = STATUS[detail.status] || STATUS.not_installed;
    const prog = progOf({ id: detail.id, progress: detail.progress });
    const doneSet = new Set(prog.done);
    const total = prog.total || (detail.tree ? detail.tree.modules.reduce(
      (n, m) => n + m.sections.reduce((k, s) => k + s.points.length, 0), 0) : 0);
    const bookName = packs?.find((p) => p.id === detail.id)?.name || detail.id;
    const pct = total > 0 ? Math.round((prog.done.length / total) * 100) : 0;

    return (
      <div className="flex flex-col h-full">
        <button className="btn-ghost text-xs self-start mb-2" onClick={closeDetail}>
          ← 返回
        </button>

        {/* 书头：名称 + 进度 + 主行动 */}
        <div className="border border-line rounded-lg bg-card/60 px-3 py-2.5 mb-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-baseline gap-1.5 min-w-0">
              <h2 className="font-display text-base font-bold truncate">{bookName}</h2>
              {detail.curated && (
                <span
                  className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full border border-pine/35 text-pine bg-pine/10"
                  title="按零基础教程蓝图精编的完整学习主线"
                >
                  精编
                </span>
              )}
            </span>
            <span className={`text-[10px] ${meta.cls}`}>{meta.label}</span>
          </div>
          {detail.tree && (
            <>
              <div className="flex items-center justify-between text-[11px] text-ink-soft mt-1.5 mb-1">
                <span>{prog.step === 'pack_done' ? '全部学完' : `已学 ${prog.done.length} / ${total} 点`}</span>
                <span className="font-mono">{pct}%</span>
              </div>
              <ProgressBar done={prog.done.length} total={total} />
              <div className="flex items-center gap-2 mt-2.5">
                <button className="btn-ink text-xs px-4 py-1.5 flex-1" onClick={() => onResume?.(detail.id)}>
                  {learnLabel(prog)}
                </button>
                {prog.started && (
                  <button
                    className="btn-ghost text-[11px] px-2 py-1.5"
                    title="清空进度，从第一个点重新学"
                    onClick={() => {
                      if (window.confirm('清空这门的进度，从第一个点重新学？')) onRestart?.(detail.id);
                    }}
                  >
                    从头重学
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* 目录：模块折叠卡 → 小节 → 点（时间线轨道） */}
        {detail.tree ? (
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
            {detail.tree.modules.map((m, mi) => {
              const mPoints = m.sections.flatMap((s) => s.points);
              const mDone = mPoints.filter((p) => doneSet.has(p.id)).length;
              const open = !!expanded[mi];
              const mComplete = mDone === mPoints.length && mPoints.length > 0;
              return (
                <div key={mi} className="border border-line rounded-lg bg-card/40 overflow-hidden shrink-0">
                  <button
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-paper-deep/50 transition-colors"
                    onClick={() => setExpanded((prev) => ({ ...prev, [mi]: !prev[mi] }))}
                  >
                    <span className={`w-6 h-6 shrink-0 grid place-items-center rounded font-mono text-[10px] border ${
                      mComplete ? 'border-pine/40 text-pine bg-pine/5' : 'border-line text-ink-soft'
                    }`}>
                      {mComplete ? '✓' : String(mi + 1).padStart(2, '0')}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-display text-[13px] font-bold leading-tight truncate">
                        {cleanTitle(m.title)}
                      </span>
                      <span className="block text-[10px] text-ink-faint mt-0.5">
                        {m.sections.length} 小节 · {mDone}/{mPoints.length} 点
                      </span>
                    </span>
                    <span className={`text-ink-faint text-[10px] transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                  </button>
                  {open && (
                    <div className="px-2.5 pb-2.5">
                      {m.sections.map((s, si) => {
                        const sDone = s.points.filter((p) => doneSet.has(p.id)).length;
                        return (
                          <div key={si} className="mt-2 first:mt-1">
                            <div className="flex items-baseline justify-between gap-2 mb-1">
                              <span className="text-[11px] font-medium text-ink-soft">{s.title}</span>
                              <span className={`text-[10px] font-mono ${sDone === s.points.length ? 'text-pine' : 'text-ink-faint'}`}>
                                {sDone}/{s.points.length}
                              </span>
                            </div>
                            <ul className="border-l border-line ml-1 pl-2 flex flex-col gap-0.5">
                              {s.points.map((p, pi) => {
                                const done = doneSet.has(p.id);
                                const current = prog.current === p.id && prog.step !== 'pack_done';
                                return (
                                  <li key={p.id} ref={current ? currentRef : null}>
                                    <button
                                      className={`w-full text-left flex items-start gap-1.5 px-1.5 py-1 rounded text-xs leading-snug transition-colors ${
                                        current
                                          ? 'bg-cinnabar/10 text-cinnabar font-medium'
                                          : done
                                            ? 'text-ink-soft hover:bg-paper-deep/60'
                                            : 'text-ink-faint hover:bg-paper-deep/60 hover:text-ink'
                                      }`}
                                      title={p.goal}
                                      onClick={() => onSelectPack?.(detail.id, p)}
                                    >
                                      <span className={`shrink-0 ${done ? 'text-pine' : current ? 'text-cinnabar' : 'text-ink-faint/60'}`}>
                                        {done ? '✓' : current ? '●' : '○'}
                                      </span>
                                      <span className="min-w-0">
                                        <span className="font-mono text-[9px] opacity-60 mr-1">{mi + 1}.{si + 1}.{pi + 1}</span>
                                        {p.title}
                                      </span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto text-[11px] font-mono text-ink-soft bg-paper-deep/60 border border-line rounded-lg p-3 whitespace-pre-wrap">
            {(detail.log || []).join('\n') || '暂无日志'}
          </div>
        )}
        {detail.status === 'error' && (
          <button className="btn-seal text-xs mt-3" onClick={() => install(detail.id)}>
            重试安装
          </button>
        )}
      </div>
    );
  }

  // ── 书架（列表）视图 ────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {!packs ? (
        <div className="text-xs text-ink-faint">加载中…</div>
      ) : (
        <div className="flex flex-col gap-2 stagger overflow-y-auto">
          {packs.map((p) => {
            const st = STATUS[p.status] || STATUS.not_installed;
            const active = ACTIVE.has(p.status);
            const prog = progOf(p);
            return (
              <div key={p.id} className="border border-line rounded-lg px-3 py-2.5 bg-card/50">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <button
                      className="text-sm font-medium font-mono hover:text-cinnabar transition-colors text-left truncate"
                      onClick={() => openDetail(p.id)}
                      title="打开学习书"
                    >
                      {p.name}
                    </button>
                    {p.curated && (
                      <span
                        className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full border border-pine/35 text-pine bg-pine/10"
                        title="按零基础教程蓝图精编的完整学习主线"
                      >
                        精编
                      </span>
                    )}
                  </span>
                  {p.status !== 'ready' && (
                    <span className={`text-[10px] whitespace-nowrap ${st.cls}`}>
                      {active && <span className="inline-block animate-pulse">● </span>}
                      {st.label}
                    </span>
                  )}
                </div>
                {p.status === 'ready' && prog.total > 0 && (
                  <div className="mt-1.5">
                    <ProgressBar done={prog.done.length} total={prog.total} />
                    <div className="text-[10px] text-ink-faint mt-0.5">
                      {prog.step === 'pack_done' ? '已学完' : `已学 ${prog.done.length}/${prog.total} 点`}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px] text-ink-faint">
                    {p.doc_count > 0 ? `${p.doc_count} 篇官方文档` : '官方中文文档'}
                  </span>
                  {p.status === 'ready' ? (
                    <button className="text-[11px] text-pine hover:underline" onClick={() => onResume?.(p.id)}>
                      {learnLabel(prog)} →
                    </button>
                  ) : active ? (
                    <button className="text-[11px] text-ink-faint hover:underline" onClick={() => openDetail(p.id)}>
                      进度
                    </button>
                  ) : (
                    <button
                      className="text-[11px] text-cinnabar hover:underline disabled:opacity-50"
                      disabled={busy === p.id}
                      onClick={() => install(p.id)}
                    >
                      {p.status === 'error' ? '重试' : '安装'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-auto pt-3 text-[11px] text-ink-faint leading-relaxed">
        点书名打开目录。进度存在服务器，换电脑接着学。
      </p>
    </div>
  );
}