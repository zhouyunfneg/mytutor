import { useCallback, useEffect, useRef, useState } from 'react';
import CodePanel from '../components/CodePanel.jsx';
import PackPanel, { PACK_STATUS, PACK_ACTIVE } from '../components/PackPanel.jsx';
import TeachCard from '../components/TeachCard.jsx';
import SegTabs from '../components/SegTabs.jsx';
import { api } from '../api.js';
import { useIsMobile } from '../useIsMobile.js';

const LOGO = `${import.meta.env.BASE_URL}logo.svg`;

const LOCK_LANG = { python: 'python', javascript: 'javascript', typescript: 'typescript', 'html-css': 'html', c: 'c', cpp: 'cpp', csharp: 'csharp', rust: 'rust', go: 'go' };

// 未选语言时的空态：用各语言一句话特点代替循环说明，帮学习者先认识再选
const LANG_INTRO = [
  { id: 'python', name: 'Python', blurb: '语法最接近自然语言，上手快；AI、数据与自动化首选。' },
  { id: 'javascript', name: 'JavaScript', blurb: '浏览器原生语言，网页交互与 Node 全栈都靠它。' },
  { id: 'html-css', name: 'HTML / CSS', blurb: '网页的骨架与样式，做页面必学的第一步。' },
  { id: 'typescript', name: 'TypeScript', blurb: '给 JavaScript 加类型，错误更早暴露，大项目更稳。' },
  { id: 'c', name: 'C', blurb: '小而贴近硬件，指针与内存手动管，系统编程基石。' },
  { id: 'cpp', name: 'C++', blurb: 'C 加面向对象与泛型，极致性能，游戏引擎常用。' },
  { id: 'csharp', name: 'C#', blurb: '微软系现代语言，Unity 游戏与企业应用广泛。' },
  { id: 'rust', name: 'Rust', blurb: '所有权机制编译期杜绝内存错误，安全与性能兼得。' },
  { id: 'go', name: 'Go', blurb: '语法极简、并发内置，云原生与后端服务主流。' },
];

const ChevronsRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 17 5-5-5-5" /><path d="m13 17 5-5-5-5" />
  </svg>
);
const PanelLeftClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="m16 15-3-3 3-3" />
  </svg>
);
const BookOpen = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" /><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" />
  </svg>
);

export default function Learn({ homeTick = 0 }) {
  const [packId, setPackId] = useState(null);
  const [session, setSession] = useState(null);
  const [mirror, setMirror] = useState({ lang: 'python', code: '' });
  const [inject, setInject] = useState(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [packPanelKey, setPackPanelKey] = useState(0);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('mytutor-book-collapsed') === '1');
  const [packsMeta, setPacksMeta] = useState(null);
  // 首页语言卡整张可点：就绪直接进去学；未装则装好自动进去学；安装中翻到左栏看进度
  const [shelfOpenId, setShelfOpenId] = useState(null); // 让左栏学习书直接翻到某本（重挂载生效）
  const [introBusy, setIntroBusy] = useState(null);     // 刚点下安装、状态还没回来的那一瞬
  const [introErr, setIntroErr] = useState(null);       // {id, msg} 安装失败原因，照实显示不吞掉
  const waitInstallRef = useRef(null);                  // 等它装完自动开学的 pid
  // 开包进行中屏蔽 refresh：packId 变化触发的 GET 可能早于 start 存盘返回 null，
  // 晚到会覆盖 start 的结果，新课首次「开始学习」会卡在空态
  const openingRef = useRef(false);
  const isMobile = useIsMobile();
  // 手机：讲解/代码区分段页签 + 目录抽屉
  const [mTab, setMTab] = useState('teach');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 手机回书架：清选书 + 关抽屉 + 复位页签（保留代码区已写内容，与 LOGO home 一致）
  const backToShelf = () => {
    setPackId(null);
    setSession(null);
    setBookOpen(false);
    setDrawerOpen(false);
    setMTab('teach');
    setShelfOpenId(null);
    setPackPanelKey((k) => k + 1);
  };

  useEffect(() => {
    localStorage.setItem('mytutor-book-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  // LOGO home 信号：回默认页（清选书 + 关书详情重挂载书架），但保留代码区已写内容不丢
  useEffect(() => {
    if (!homeTick) return;
    setPackId(null);
    setSession(null);
    setBookOpen(false);
    setShelfOpenId(null);
    setPackPanelKey((k) => k + 1);
  }, [homeTick]);

  const refreshPacks = useCallback(async () => {
    try {
      const list = await api.get('/api/packs');
      setPacksMeta(list);
      return list;
    } catch {
      return null;
    }
  }, []);

  // 书脊进度：当前包的总点数；未选包时显示最近在读的那本
  useEffect(() => {
    refreshPacks();
  }, [packId, refreshPacks]);

  // 有包在安装中 → 轮询，让首页卡片的状态实时走（抓取文档 / 建索引 / 生成技能树）
  useEffect(() => {
    if (!(packsMeta || []).some((p) => PACK_ACTIVE.has(p.status))) return undefined;
    const t = setInterval(refreshPacks, 3000);
    return () => clearInterval(t);
  }, [packsMeta, refreshPacks]);

  // 点卡片触发的安装：装好自动进入学习；失败就停在那张卡上显示原因，可再点重试
  useEffect(() => {
    const pid = waitInstallRef.current;
    if (!pid || !packsMeta) return;
    const p = packsMeta.find((x) => x.id === pid);
    if (!p) return;
    if (p.status === 'ready') {
      waitInstallRef.current = null;
      setIntroBusy(null);
      openPack(pid);
    } else if (p.status === 'error') {
      waitInstallRef.current = null;
      setIntroBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packsMeta]);

  const railPack = packId
    ? (packsMeta || []).find((p) => p.id === packId)
    : (packsMeta || []).find((p) => p.progress?.started);
  const railDone = packId ? session?.done_points?.length || 0 : railPack?.progress?.done?.length || 0;
  const railTotal = railPack?.progress?.total || 0;
  const railPct = railTotal > 0 ? Math.round((railDone / railTotal) * 100) : 0;

  const refresh = useCallback(async () => {
    if (!packId || openingRef.current) return;
    try {
      setSession(await api.get(`/api/teach/${packId}`));
    } catch {
      setSession(null);
    }
  }, [packId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 左栏点技能树某个点 = 从该点开始学
  const onSelectPack = async (pid, point) => {
    openingRef.current = true;
    setPackId(pid);
    setSession(null);
    try {
      const r = await api.post(`/api/teach/${pid}/start`, { point_id: point?.id });
      if (r && r.ok === false) {
        setSession({ step: 'none', error: r.error });
      } else {
        setSession(r);
      }
    } catch (e) {
      setSession({ step: 'none', error: String(e.message || e) });
    } finally {
      openingRef.current = false;
    }
  };

  // 开始/继续学习：有会话接着上次位置，没有则从第一个点开始；restart 清进度重来
  const openPack = async (pid, { restart = false } = {}) => {
    openingRef.current = true;
    setPackId(pid);
    setSession(null);
    try {
      let r;
      if (restart) {
        r = await api.post(`/api/teach/${pid}/start`, { restart: true });
      } else {
        const st = await api.get(`/api/teach/${pid}`);
        r = st && st.step && st.step !== 'none' ? st : await api.post(`/api/teach/${pid}/start`, {});
      }
      setSession(r && r.ok === false ? { step: 'none', error: r.error } : r);
    } catch (e) {
      setSession({ step: 'none', error: String(e.message || e) });
    } finally {
      openingRef.current = false;
    }
  };

  const lockLang = packId ? LOCK_LANG[packId] || null : null;

  // 让左栏学习书直接翻到某本书（看安装日志 / 目录）：收纳态先展开，再重挂载书架
  const openShelfDetail = (pid) => {
    setCollapsed(false);
    setShelfOpenId(pid);
    setPackPanelKey((k) => k + 1);
  };

  // 首页语言卡点击：与书架里同一套语义，只是省掉"先找左栏再点书名"这两步
  const onIntroClick = async (pid) => {
    if (introBusy === pid) return; // 启动窗口内重复点：不再发第二次安装（后端会判"正在安装中"）
    const p = (packsMeta || []).find((x) => x.id === pid);
    const status = p?.status || 'not_installed';
    if (status === 'ready') {
      setIntroErr(null);
      openPack(pid);
      return;
    }
    if (PACK_ACTIVE.has(status)) {
      openShelfDetail(pid); // 正在装：翻到书里看实时日志，不重复触发安装
      return;
    }
    setIntroBusy(pid);
    setIntroErr(null);
    waitInstallRef.current = pid;
    try {
      const r = await api.post(`/api/packs/${pid}/install`);
      if (r && r.ok === false) {
        waitInstallRef.current = null;
        setIntroErr({ id: pid, msg: r.error || '安装失败，可再点一次重试' });
      }
      await refreshPacks();
    } catch (e) {
      waitInstallRef.current = null;
      setIntroErr({ id: pid, msg: String(e.message || e) });
    } finally {
      setIntroBusy(null);
    }
  };

  // ── 手机布局：书架全屏 ↔ 学习视图（书头栏 + 讲解|代码区页签 + 目录抽屉）──
  if (isMobile) {
    const teachEl = (
      <TeachCard
        packId={packId}
        session={session?.error ? { step: 'none' } : session}
        refresh={refresh}
        code={mirror.code}
        onLoadStarter={(starter) => setInject({ lang: lockLang || 'python', code: starter, n: Date.now() })}
      />
    );
    const codeEl = (
      <CodePanel lockLang={lockLang} inject={inject} onCodeChange={(lang, code) => setMirror({ lang, code })} />
    );
    const panelProps = {
      onSelectPack: (pid, point) => { setDrawerOpen(false); setMTab('teach'); onSelectPack(pid, point); },
      onResume: (pid) => { setDrawerOpen(false); setMTab('teach'); openPack(pid); },
      onRestart: (pid) => { setDrawerOpen(false); setMTab('teach'); openPack(pid, { restart: true }); },
      onDetailChange: setBookOpen,
      activePackId: packId,
      session,
    };
    return (
      <div className="flex flex-col h-full">
        {!packId ? (
          <div className="flex-1 min-h-0 p-3">
            <div className="paper-card h-full p-4 flex flex-col fade-up">
              <div className="shrink-0 flex items-center gap-2 pb-3 mb-3 border-b border-line/60">
                <img src={LOGO} alt="MyTutor" className="w-7 h-7 select-none" />
                <span className="font-display text-base font-bold flex-1">学习书</span>
                <span className="text-[10px] text-ink-faint">选一门开始</span>
              </div>
              <div className="flex-1 min-h-0">
                <PackPanel key={packPanelKey} {...panelProps} />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* 书头栏：返回书架 + 书名进度 + 目录 */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-line/60 bg-paper-deep/40">
              <button type="button" onClick={backToShelf} className="btn-ghost shrink-0 text-xs px-3 min-h-[40px] inline-flex items-center gap-1">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                书架
              </button>
              <div className="flex-1 min-w-0">
                <div className="font-display text-sm font-bold truncate">{railPack?.name || packId}</div>
                <div className="text-[10px] text-ink-faint font-mono">已学 {railDone}/{railTotal} · {railPct}%</div>
              </div>
              <button type="button" onClick={() => setDrawerOpen(true)} className="btn-ghost shrink-0 text-xs px-3 min-h-[40px]">目录</button>
            </div>
            {/* 讲解 | 代码区 */}
            <div className="shrink-0 px-3 py-1">
              <SegTabs tabs={[{ id: 'teach', label: '讲解' }, { id: 'code', label: '代码区' }]} value={mTab} onChange={setMTab} />
            </div>
            {/* 内容：两块都挂载，visibility 切换以保留编辑器状态与 Monaco 布局 */}
            <div className="flex-1 min-h-0 relative">
              <div className="absolute inset-0 p-2" style={{ visibility: mTab === 'teach' ? 'visible' : 'hidden' }}>
                <div className="paper-card h-full p-3 flex flex-col overflow-hidden">
                  {teachEl}
                  {session?.error && (
                    <div className="mt-3 text-xs text-cinnabar bg-cinnabar/5 border border-cinnabar/30 rounded-lg px-3 py-2">{session.error}</div>
                  )}
                </div>
              </div>
              <div className="absolute inset-0 p-2" style={{ visibility: mTab === 'code' ? 'visible' : 'hidden' }}>
                {codeEl}
              </div>
            </div>
          </>
        )}

        {/* 目录抽屉：从右滑入，直接展开当前书的技能树 */}
        {drawerOpen && packId && (
          <div className="fixed inset-0 z-50 flex">
            <div className="drawer-backdrop absolute inset-0" onClick={() => setDrawerOpen(false)} />
            <div className="drawer-panel relative ml-auto h-full w-[88vw] max-w-[360px] p-4 flex flex-col">
              <div className="shrink-0 flex items-center gap-2 pb-3 mb-3 border-b border-line/60">
                <span className="font-display text-base font-bold flex-1">目录</span>
                <button type="button" onClick={() => setDrawerOpen(false)} className="btn-ghost w-9 h-9 grid place-items-center rounded-full" aria-label="关闭目录">✕</button>
              </div>
              <div className="flex-1 min-h-0">
                <PackPanel key={`drawer-${packId}`} autoOpenId={packId} {...panelProps} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4 p-4">
      {/* 左：学习书。收纳态是一条"书脊"窄轨，整条可点展开 */}
      <div
        className="shrink-0 paper-card fade-up relative overflow-hidden"
        style={{ width: collapsed ? 46 : bookOpen ? 320 : 230, transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        {/* 书脊（收纳态）：圆形玻璃展开钮 + 竖排书名 + 书签式进度 + 页码 */}
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label={`展开学习书${railTotal > 0 ? `（已学 ${railDone} / ${railTotal} 点）` : ''}`}
          aria-expanded={!collapsed}
          className="book-rail absolute inset-0 flex flex-col items-center pt-3 pb-3.5"
          style={{
            opacity: collapsed ? 1 : 0,
            visibility: collapsed ? 'visible' : 'hidden',
            pointerEvents: collapsed ? 'auto' : 'none',
            transition: collapsed
              ? 'opacity 0.22s ease 0.1s, visibility 0s'
              : 'opacity 0.15s ease, visibility 0s linear 0.15s',
          }}
        >
          <span className="rail-chip w-7 h-7 shrink-0 grid place-items-center rounded-full border border-line/70 bg-card/70 text-ink-soft shadow-sm">
            <ChevronsRight />
          </span>
          <span
            className="font-display text-xs text-ink-soft select-none mt-5"
            style={{ writingMode: 'vertical-rl', letterSpacing: '0.35em' }}
          >
            学习书
          </span>
          <span className="flex-1 min-h-0 w-full flex justify-center py-4">
            {railTotal > 0 && (
              <span className="rail-track block h-full max-h-[120px] min-h-[36px]">
                <span className="rail-fill block w-full" style={{ height: `${railPct}%` }} />
              </span>
            )}
          </span>
          {railTotal > 0 && (
            <span
              className="shrink-0 font-mono text-[10px] text-ink-faint select-none"
              title={`已学 ${railDone} / ${railTotal} 点`}
            >
              {railDone}
            </span>
          )}
        </button>

        {/* 书页（展开态）：书头栏 + 目录。收纳时淡出但不卸载，位置保留 */}
        <div
          className="h-full flex flex-col"
          aria-hidden={collapsed}
          style={{
            width: bookOpen ? 320 : 230,
            opacity: collapsed ? 0 : 1,
            visibility: collapsed ? 'hidden' : 'visible',
            pointerEvents: collapsed ? 'none' : 'auto',
            transition: collapsed
              ? 'opacity 0.15s ease, visibility 0s linear 0.15s'
              : 'opacity 0.22s ease 0.1s, visibility 0s',
          }}
        >
          <div className="shrink-0 flex items-center gap-2 px-4 pt-3.5 pb-2.5 border-b border-line/60">
            <span className="text-ink-soft"><BookOpen /></span>
            <span className="font-display text-sm font-bold flex-1">学习书</span>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title="收纳学习书，专心当前内容"
              aria-label="收纳学习书"
              className="btn-ghost w-7 h-7 grid place-items-center rounded-full"
            >
              <PanelLeftClose />
            </button>
          </div>
          <div className="flex-1 min-h-0 p-4 pt-3">
            <PackPanel
              key={packPanelKey}
              autoOpenId={shelfOpenId}
              onSelectPack={onSelectPack}
              onResume={(pid) => openPack(pid)}
              onRestart={(pid) => openPack(pid, { restart: true })}
              onDetailChange={setBookOpen}
              activePackId={packId}
              session={session}
            />
          </div>
        </div>
      </div>

      {/* 中：当前微知识点 */}
      <div className="flex-1 min-w-0 paper-card p-5 flex flex-col fade-up" style={{ animationDelay: '0.06s' }}>
        {packId ? (
          <TeachCard
            packId={packId}
            session={session?.error ? { step: 'none' } : session}
            refresh={refresh}
            code={mirror.code}
            onLoadStarter={(starter) => setInject({ lang: lockLang || 'python', code: starter, n: Date.now() })}
          />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto py-6 px-1 flex">
            <div className="m-auto w-full max-w-[680px]">
              <div className="text-center mb-6">
                <img src={LOGO} alt="MyTutor" className="w-12 h-12 mx-auto mb-4 select-none" />
                <h3 className="font-display text-xl font-bold mb-2">认识语言，点一门直接开始</h3>
                <p className="text-xs text-ink-faint">讲一小段 → 做小题 → 纠错 → 巩固，你点「下一个」才前进。</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {(packsMeta?.length
                  ? packsMeta.map((p) => LANG_INTRO.find((x) => x.id === p.id)).filter(Boolean)
                  : LANG_INTRO
                ).map((l) => {
                  const p = (packsMeta || []).find((x) => x.id === l.id);
                  const status = p?.status || 'not_installed';
                  const active = PACK_ACTIVE.has(status);
                  const busy = introBusy === l.id;
                  const prog = p?.progress || { started: false, done: [], total: 0, step: 'none' };
                  const pct = prog.total > 0 ? Math.round((prog.done.length / prog.total) * 100) : 0;
                  const st = PACK_STATUS[status] || PACK_STATUS.not_installed;
                  const starting = busy && !active; // 安装请求已在路上、状态还没回来的那一瞬
                  const action = status === 'ready'
                    ? (prog.started ? (prog.step === 'pack_done' ? '回顾' : '继续学习') : '开始学习')
                    : starting ? '启动中' : active ? '看安装进度' : status === 'error' ? '重试安装' : '安装并学习';
                  const err = introErr?.id === l.id ? introErr.msg : null;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      className="lang-card group min-w-0 rounded-xl border border-line/70 bg-paper-deep/50 px-4 py-3 text-left"
                      onClick={() => onIntroClick(l.id)}
                      title={status === 'ready' ? `${action} · ${l.name}` : `${action} · ${st.label}`}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="font-display text-[15px] font-bold truncate min-w-0">{l.name}</span>
                        {p?.curated && (
                          <span
                            className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full border border-pine/35 text-pine bg-pine/10"
                            title="按零基础教程蓝图精编的完整学习主线"
                          >
                            精编
                          </span>
                        )}
                        <span className="flex-1" />
                        <span className="lang-arrow shrink-0 w-5 h-5 grid place-items-center rounded-full border border-line/70 bg-card/70 text-ink-faint">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </span>
                      </span>
                      <span className="lang-blurb block text-[13px] leading-6 text-ink-soft mt-1">{l.blurb}</span>
                      {prog.started && prog.total > 0 && (
                        <span className="block mt-2">
                          <span className="block h-1.5 rounded-full bg-paper-deep overflow-hidden">
                            <span className="block h-full bg-pine transition-all duration-500" style={{ width: `${pct}%` }} />
                          </span>
                          <span className="block text-[10px] text-ink-faint mt-1">
                            {prog.step === 'pack_done' ? '已学完' : `已学 ${prog.done.length}/${prog.total} 点`}
                          </span>
                        </span>
                      )}
                      {/* 状态字与行动字同一行，窄栏自动换行（放顶部会挤爆语言名 → 横向溢出） */}
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-2 text-[11px]">
                        {status !== 'ready' && (
                          <span className={`shrink-0 text-[10px] ${st.cls}`}>
                            {(active || busy) && <span className="inline-block animate-pulse">● </span>}
                            {busy && !active ? '启动中…' : st.label}
                          </span>
                        )}
                        <span className={
                          status === 'ready' ? 'text-pine' : status === 'error' ? 'text-cinnabar-deep' : 'text-cinnabar'
                        }>
                          {action}{starting ? '…' : ' →'}
                        </span>
                      </span>
                      {err && <span className="block text-[10px] text-cinnabar-deep mt-1 leading-4">{err}</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-ink-faint mt-5 text-center">
                点卡片直接进去学；没装的语言会自动装好再进入（首次抓文档+生成技能树要等几分钟）。进度记在服务器，换电脑接着学。
              </p>
            </div>
          </div>
        )}
        {session?.error && (
          <div className="mt-3 text-xs text-cinnabar bg-cinnabar/5 border border-cinnabar/30 rounded-lg px-3 py-2">
            {session.error}
          </div>
        )}
      </div>

      {/* 右：代码区 */}
      <div className="w-[44%] shrink-0 fade-up" style={{ animationDelay: '0.12s' }}>
        <CodePanel
          lockLang={lockLang}
          inject={inject}
          onCodeChange={(lang, code) => setMirror({ lang, code })}
        />
      </div>
    </div>
  );
}