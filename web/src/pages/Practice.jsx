import { useCallback, useEffect, useState } from 'react';
import CodePanel from '../components/CodePanel.jsx';
import SegTabs from '../components/SegTabs.jsx';
import { api } from '../api.js';
import { StudyTimerBadge, useStudyTimer } from '../StudyTimer.jsx';
import { useIsMobile } from '../useIsMobile.js';

const LOCK_LANG = { python: 'python', javascript: 'javascript', typescript: 'typescript', 'html-css': 'html', c: 'c', cpp: 'cpp', csharp: 'csharp', rust: 'rust', go: 'go' };
const MODES = [
  { id: 'due', label: '间隔复习' },
  { id: 'wrong', label: '错题重练' },
  { id: 'point', label: '节点刷题' },
];

const Pencil = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);
const ChevronLeft = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

const fmtDue = (d) => {
  const [, m, dd] = d.split('-');
  return `${Number(m)}月${Number(dd)}日`;
};

function Stat({ n, label, tone }) {
  return (
    <div className="flex-1 text-center border border-line rounded-lg bg-card/50 py-1.5">
      <div className={`font-mono text-base font-bold leading-none ${tone || 'text-ink'}`}>{n}</div>
      <div className="text-[10px] text-ink-faint mt-1">{label}</div>
    </div>
  );
}

export default function Practice() {
  const [ov, setOv] = useState(null);
  const [mode, setMode] = useState('due');
  const [wrong, setWrong] = useState([]);
  const [packSel, setPackSel] = useState('python');
  const [tree, setTree] = useState(null);
  const [expanded, setExpanded] = useState({ 0: true });
  const [cur, setCur] = useState(null); // {mode, problem, point, pack_id, wrong_id, cause, count}
  const [verdict, setVerdict] = useState(null);
  const [hintOnly, setHintOnly] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [mirror, setMirror] = useState({ lang: 'python', code: '' });
  const [inject, setInject] = useState(null);
  const [picked, setPicked] = useState(null); // 选择/判断题选中下标
  const isMobile = useIsMobile();
  const [mTab, setMTab] = useState('problem'); // 手机：题目 | 代码区
  const { reportContext } = useStudyTimer();

  useEffect(() => {
    reportContext({
      kind: 'practice', pack_id: cur?.pack_id || '',
      pack_name: ov?.packs?.find((p) => p.id === cur?.pack_id)?.name || cur?.pack_id || '',
      point_id: cur?.point?.id || '', title: cur?.point?.title || '',
    });
    return () => reportContext(null);
  }, [cur?.pack_id, cur?.point?.id, cur?.point?.title, ov?.packs, reportContext]);

  const refreshOv = useCallback(async () => {
    try {
      setOv(await api.get('/api/practice/overview'));
    } catch {
      setOv(null);
    }
    window.dispatchEvent(new Event('mytutor:practice'));
  }, []);

  const refreshWrong = useCallback(async () => {
    try {
      setWrong(await api.get('/api/practice/wrong'));
    } catch {
      setWrong([]);
    }
  }, []);

  useEffect(() => {
    refreshOv();
    refreshWrong();
  }, [refreshOv, refreshWrong]);

  // 节点刷题：选包后拉技能树
  useEffect(() => {
    if (mode !== 'point') return;
    api.get(`/api/packs/${packSel}`)
      .then((d) => setTree(d.tree))
      .catch(() => setTree(null));
  }, [mode, packSel]);

  const openProblem = (r) => {
    setCur(r);
    setVerdict(null);
    setHintOnly(null);
    setErr(null);
    setPicked(null);
    setMTab('problem');
    if (r.problem?.starter) {
      setInject({ lang: LOCK_LANG[r.pack_id] || 'python', code: r.problem.starter, n: Date.now() });
    }
  };

  const next = async (m, opts = {}) => {
    setBusy('next');
    setErr(null);
    try {
      const r = await api.post('/api/practice/next', { mode: m, force_new: false, ...opts });
      if (r && r.ok === false) setErr(r.error);
      else openProblem(r);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!cur) return;
    setBusy('submit');
    setHintOnly(null);
    try {
      const r = await api.post('/api/practice/submit', {
        pack_id: cur.pack_id, problem_id: cur.problem.id,
        code: cur.problem.judge?.mode === 'choice' ? '' : mirror.code,
        choice: cur.problem.judge?.mode === 'choice' ? picked : null,
        wrong_id: cur.wrong_id || null,
      });
      if (r && r.ok === false) setErr(r.error);
      else {
        setVerdict(r);
        refreshWrong();
        refreshOv();
      }
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(null);
    }
  };

  const askHint = async () => {
    if (!cur) return;
    setBusy('hint');
    try {
      const r = await api.post('/api/practice/hint', {
        pack_id: cur.pack_id, problem_id: cur.problem.id,
        code: cur.problem.judge?.mode === 'choice' ? '' : mirror.code,
        choice: cur.problem.judge?.mode === 'choice' ? picked : null,
      });
      if (r && r.ok === false) setErr(r.error);
      else setHintOnly(r.hint);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(null);
    }
  };

  const removeWrong = async (id) => {
    if (!window.confirm('从错题本移除这条？（排期不受影响）')) return;
    await api.del(`/api/practice/wrong/${id}`);
    refreshWrong();
    refreshOv();
    if (cur?.wrong_id === id) setCur(null);
  };

  const rate = ov && ov.submitted > 0 ? Math.round((ov.passed / ov.submitted) * 100) : null;
  const lockLang = cur ? LOCK_LANG[cur.pack_id] || null : null;
  const isChoice = cur?.problem?.judge?.mode === 'choice';
  const schedOf = (pid) => ov?.due?.find((d) => d.point_id === pid);

  // ── 复用块：统计 / 模式页签 / 队列 / 题卡 / 代码区（桌面与手机共用内容，外壳各包各的）──
  const stats = (
    <>
      <Stat n={ov?.due_count ?? '…'} label="待复习" tone={ov?.due_count > 0 ? 'text-cinnabar' : undefined} />
      <Stat n={ov?.wrong_count ?? '…'} label="错题" tone={ov?.wrong_count > 0 ? 'text-cinnabar-deep' : undefined} />
      <Stat n={rate === null ? '—' : `${rate}%`} label="判对率" tone="text-pine" />
    </>
  );

  const modeTabs = MODES.map((m) => (
    <button
      key={m.id}
      onClick={() => { setMode(m.id); setErr(null); }}
      className={`flex-1 text-[11px] py-1.5 rounded-md border transition-colors ${
        mode === m.id
          ? 'bg-ink text-paper border-ink font-medium'
          : 'border-line text-ink-soft hover:text-ink hover:bg-card/70'
      }`}
    >
      {m.label}
    </button>
  ));

  const queue = (
    <>
      {mode === 'due' && (
        <>
          {(ov?.due || []).map((d) => (
            <button
              key={d.point_id}
              className="text-left border border-line rounded-lg bg-card/50 px-2.5 py-2 hover:bg-card/80 transition-colors"
              onClick={() => next('due', { pack_id: d.pack_id, point_id: d.point_id })}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium truncate">{d.title}</span>
                <span className={`text-[10px] whitespace-nowrap ${d.overdue > 0 ? 'text-cinnabar' : 'text-pine'}`}>
                  {d.overdue > 0 ? `逾期 ${d.overdue} 天` : '今天到期'}
                </span>
              </div>
              <div className="text-[10px] text-ink-faint mt-0.5">
                第 {d.reps + 1} 次复习 · 间隔 {d.interval} 天
              </div>
            </button>
          ))}
          {ov && ov.due_count === 0 && (
            <p className="text-[11px] text-ink-faint leading-relaxed mt-1">
              今天没有到期的复习点。去「节点刷题」巩固，或看看错题本。
            </p>
          )}
        </>
      )}

      {mode === 'wrong' && (
        <>
          {wrong.map((w) => (
            <div key={w.id} className="border border-line rounded-lg bg-card/50 px-2.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium truncate">{w.title}</span>
                <span className="text-[10px] text-cinnabar-deep whitespace-nowrap">错 {w.count} 次</span>
              </div>
              {w.cause && <p className="text-[10px] text-ink-soft mt-0.5 leading-snug">错因：{w.cause}</p>}
              <p className="text-[10px] text-ink-faint mt-0.5 truncate" title={w.task}>{w.task}</p>
              <div className="flex gap-2 mt-1.5">
                <button
                  className="text-[11px] text-pine hover:underline"
                  onClick={() => next('wrong', { wrong_id: w.id })}
                >
                  重练 →
                </button>
                <button className="text-[11px] text-ink-faint hover:text-cinnabar-deep" onClick={() => removeWrong(w.id)}>
                  移除
                </button>
              </div>
            </div>
          ))}
          {wrong.length === 0 && (
            <p className="text-[11px] text-ink-faint leading-relaxed mt-1">
              错题本是空的。判错的题会自动记进来：题面、你当时的代码、提示和一句错因；重练做对自动消除。
            </p>
          )}
        </>
      )}

      {mode === 'point' && (
        <>
          <select className="field w-full text-xs py-1.5" value={packSel} onChange={(e) => setPackSel(e.target.value)}>
            {(ov?.packs || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}（已学 {p.learned}/{p.total}）</option>
            ))}
          </select>
          {!tree && <p className="text-[11px] text-ink-faint mt-1">语言包未就绪或加载中…</p>}
          {(tree?.modules || []).map((m, mi) => (
            <div key={mi} className="border border-line rounded-lg bg-card/40 overflow-hidden">
              <button
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-paper-deep/50"
                onClick={() => setExpanded((p) => ({ ...p, [mi]: !p[mi] }))}
              >
                <span className="flex-1 text-[11px] font-medium truncate">{m.title.replace(/^模块[一二三四五六七八九十\d]+[：:·\s]*/, '')}</span>
                <span className={`text-ink-faint text-[10px] transition-transform ${expanded[mi] ? 'rotate-90' : ''}`}>▶</span>
              </button>
              {expanded[mi] && m.sections.map((s, si) => (
                <div key={si} className="px-2.5 pb-1.5">
                  <div className="text-[10px] text-ink-faint mb-0.5">{s.title}</div>
                  {s.points.map((p) => {
                    const d = schedOf(p.id);
                    return (
                      <button
                        key={p.id}
                        className="w-full text-left flex items-baseline gap-1.5 px-1.5 py-1 rounded text-[11px] hover:bg-paper-deep/60"
                        onClick={() => next('point', { pack_id: packSel, point_id: p.id })}
                      >
                        <span className="flex-1 min-w-0 truncate">{p.title}</span>
                        <span className={`text-[9px] font-mono whitespace-nowrap ${d ? 'text-cinnabar' : 'text-ink-faint/70'}`}>
                          {d ? (d.overdue > 0 ? `逾期${d.overdue}天` : '今日到期') : '未排期'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </>
  );

  const problem = !cur ? (
    <div className="flex-1 grid place-items-center">
      <div className="text-center max-w-sm">
        <div className="seal w-14 h-14 mx-auto flex items-center justify-center text-2xl font-bold mb-5">练</div>
        <h3 className="font-display text-xl font-bold mb-3">一题一练，错了记下来</h3>
        <p className="text-sm text-ink-soft leading-relaxed">
          间隔复习按 1→3→7→15→30 天排期，做对往后推、做错归零重来；
          错题本记错因，重练做对自动消除。判题只给提示，不给答案。
        </p>
        <p className="text-xs text-ink-faint mt-4">
          {mode === 'due' ? '左栏点一个到期点开始复习。' : mode === 'wrong' ? '左栏点「重练」开始。' : '左栏选包选点开始刷题。'}
        </p>
      </div>
    </div>
  ) : (
    <>
      <div className="text-[11px] text-ink-faint mb-1.5">
        {ov?.packs?.find((p) => p.id === cur.pack_id)?.name || cur.pack_id} · {cur.point?.title}
        {cur.mode === 'wrong' && <span className="text-cinnabar-deep ml-2">错题重练 · 错 {cur.count} 次</span>}
        {cur.mode === 'due' && <span className="text-pine ml-2">间隔复习</span>}
      </div>
      <h2 className="font-display text-base font-bold leading-snug mb-3">{cur.problem.task}</h2>
      {cur.mode === 'wrong' && cur.cause && (
        <div className="text-xs text-ink-soft bg-paper-deep/60 border border-line rounded-lg px-3 py-2 mb-3">
          上次错因：{cur.cause}
        </div>
      )}

      {isChoice && (
        <div className="flex flex-col gap-2 mb-4">
          {cur.problem.judge.options.map((opt, i) => {
            const sel = picked === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPicked(i)}
                className={`text-left flex items-start gap-3 px-4 py-2.5 rounded-xl border transition-colors ${
                  sel ? 'border-ink/60 bg-paper-deep/80' : 'border-line bg-card/60 hover:bg-paper-deep/50'
                }`}
              >
                <span className={`shrink-0 w-6 h-6 rounded-full grid place-items-center text-[11px] font-mono font-bold ${
                  sel ? 'bg-ink text-paper' : 'bg-paper-deep text-ink-soft border border-line/70'
                }`}>{String.fromCharCode(65 + i)}</span>
                <span className="flex-1 text-[13px] leading-6 text-ink">{opt}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          className="btn-seal text-xs px-4 py-1.5"
          disabled={busy === 'submit' || (isChoice && picked === null)}
          onClick={submit}
        >
          {busy === 'submit' ? '判题中…' : '提交判题'}
        </button>
        <button className="btn-ghost text-xs px-3 py-1.5" disabled={busy === 'hint'} onClick={askHint}>
          {busy === 'hint' ? '…' : '要提示'}
        </button>
        {!isChoice && cur.problem.starter && (
          <button
            className="btn-ghost text-xs px-3 py-1.5"
            onClick={() => setInject({ lang: lockLang || 'python', code: cur.problem.starter, n: Date.now() })}
          >
            载入起始代码
          </button>
        )}
        {cur.mode !== 'wrong' && (
          <button
            className="btn-ghost text-xs px-3 py-1.5"
            disabled={busy === 'next'}
            onClick={() => next('point', { pack_id: cur.pack_id, point_id: cur.point.id, force_new: true })}
          >
            {busy === 'next' ? '出题中…' : '换一题'}
          </button>
        )}
      </div>

      {verdict?.pass && (
        <div className="border border-pine/40 bg-pine/5 rounded-lg px-3 py-2.5 mb-3 fade-up">
          <div className="text-sm text-pine font-medium">做对了 ✓</div>
          <div className="text-[11px] text-ink-soft mt-1">
            第 {verdict.sched.reps} 次做对 · 下次复习 {verdict.sched.interval} 天后（{fmtDue(verdict.sched.due)}）
            {verdict.wrong_removed && <span className="text-pine ml-2">· 已从错题本消除</span>}
          </div>
          <button
            className="btn-ink text-xs px-4 py-1.5 mt-2"
            disabled={busy === 'next'}
            onClick={() => next(cur.mode === 'wrong' ? 'point' : cur.mode, { pack_id: cur.pack_id, point_id: cur.point.id })}
          >
            {busy === 'next' ? '出题中…' : '下一题 →'}
          </button>
        </div>
      )}
      {verdict && !verdict.pass && (
        <div className="border border-cinnabar/40 bg-cinnabar/5 rounded-lg px-3 py-2.5 mb-3 fade-up">
          <div className="text-sm text-cinnabar font-medium">{isChoice ? '还不对，再想想重新选' : '还不对，改改再提交'}</div>
          <p className="text-xs text-ink-soft mt-1 leading-relaxed">{verdict.hint}</p>
          <div className="text-[10px] text-ink-faint mt-1.5">
            已记入错题本{verdict.cause ? ` · 错因：${verdict.cause}` : ''} · 复习排期归零，明天重来
          </div>
        </div>
      )}
      {hintOnly && !verdict && (
        <div className="border border-line bg-paper-deep/50 rounded-lg px-3 py-2.5 mb-3 fade-up">
          <div className="text-[10px] text-ink-faint mb-1">提示（不判题、不记错）</div>
          <p className="text-xs text-ink-soft leading-relaxed">{hintOnly}</p>
        </div>
      )}
      {err && (
        <div className="text-xs text-cinnabar bg-cinnabar/5 border border-cinnabar/30 rounded-lg px-3 py-2 mb-3">{err}</div>
      )}
      <p className="mt-auto pt-3 text-[11px] text-ink-faint leading-relaxed">
        {isChoice
          ? '选一个答案再提交；提示只指方向，不点明正确选项。'
          : isMobile
            ? '切到「代码区」写答案，可先「运行」自测再提交。提示只指方向，答案要自己改出来。'
            : '在右侧代码区写答案，可先「运行」自测再提交。提示只指方向，答案要自己改出来。'}
      </p>
    </>
  );

  const codeEl = (
    <CodePanel
      lockLang={lockLang}
      inject={inject}
      onCodeChange={(lang, code) => setMirror({ lang, code })}
    />
  );

  // ── 手机布局：顶部模式页签 + 队列 ↔ 题目（题目|代码区页签）──
  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 px-3 pt-3 pb-2 border-b border-line/60 bg-paper-deep/40 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-ink-soft"><Pencil /></span>
            <span className="font-display text-sm font-bold flex-1">练习</span>
            <StudyTimerBadge />
          </div>
          <div className="flex gap-1.5">{stats}</div>
          <div className="flex gap-1">{modeTabs}</div>
        </div>
        {cur ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 flex items-center gap-2 px-3 py-2">
              <button type="button" onClick={() => setCur(null)} className="btn-ghost shrink-0 text-xs px-3 min-h-[40px] inline-flex items-center gap-1">
                <ChevronLeft /> 队列
              </button>
              <div className="flex-1 min-w-0">
                <SegTabs tabs={[{ id: 'problem', label: '题目' }, { id: 'code', label: '代码区' }]} value={mTab} onChange={setMTab} />
              </div>
            </div>
            <div className="flex-1 min-h-0 relative">
              <div className="absolute inset-0 p-3" style={{ visibility: mTab === 'problem' ? 'visible' : 'hidden' }}>
                <div className="paper-card h-full p-4 flex flex-col overflow-y-auto">{problem}</div>
              </div>
              <div className="absolute inset-0 p-3" style={{ visibility: mTab === 'code' ? 'visible' : 'hidden' }}>
                {codeEl}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-1.5">{queue}</div>
        )}
      </div>
    );
  }

  // ── 桌面布局（原样三栏）──
  return (
    <div className="flex h-full gap-4 p-4">
      {/* 左：模式与队列 */}
      <div className="w-[280px] shrink-0 paper-card fade-up flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center gap-2 px-4 pt-3.5 pb-2.5 border-b border-line/60">
          <span className="text-ink-soft"><Pencil /></span>
          <span className="font-display text-sm font-bold flex-1">练习</span>
          <StudyTimerBadge />
        </div>
        <div className="shrink-0 px-4 pt-3 flex gap-1.5">{stats}</div>
        <div className="shrink-0 px-4 pt-2.5 pb-2 flex gap-1">{modeTabs}</div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 flex flex-col gap-1.5">{queue}</div>
      </div>

      {/* 中：题卡 */}
      <div className="flex-1 min-w-0 paper-card p-5 flex flex-col fade-up overflow-y-auto" style={{ animationDelay: '0.06s' }}>
        {problem}
      </div>

      {/* 右：代码区 */}
      <div className="w-[44%] shrink-0 fade-up" style={{ animationDelay: '0.12s' }}>
        {codeEl}
      </div>
    </div>
  );
}