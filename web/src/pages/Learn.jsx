import { useCallback, useEffect, useState } from 'react';
import CodePanel from '../components/CodePanel.jsx';
import PackPanel from '../components/PackPanel.jsx';
import TeachCard from '../components/TeachCard.jsx';
import { api } from '../api.js';

const LOCK_LANG = { python: 'python', javascript: 'javascript', typescript: 'typescript', 'html-css': 'html' };

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

export default function Learn() {
  const [packId, setPackId] = useState(null);
  const [session, setSession] = useState(null);
  const [mirror, setMirror] = useState({ lang: 'python', code: '' });
  const [inject, setInject] = useState(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('mytutor-book-collapsed') === '1');
  const [packsMeta, setPacksMeta] = useState(null);

  useEffect(() => {
    localStorage.setItem('mytutor-book-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  // 书脊进度：当前包的总点数；未选包时显示最近在读的那本
  useEffect(() => {
    api.get('/api/packs').then(setPacksMeta).catch(() => setPacksMeta(null));
  }, [packId]);

  const railPack = packId
    ? (packsMeta || []).find((p) => p.id === packId)
    : (packsMeta || []).find((p) => p.progress?.started);
  const railDone = packId ? session?.done_points?.length || 0 : railPack?.progress?.done?.length || 0;
  const railTotal = railPack?.progress?.total || 0;
  const railPct = railTotal > 0 ? Math.round((railDone / railTotal) * 100) : 0;

  const refresh = useCallback(async () => {
    if (!packId) return;
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
    }
  };

  // 开始/继续学习：有会话接着上次位置，没有则从第一个点开始；restart 清进度重来
  const openPack = async (pid, { restart = false } = {}) => {
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
    }
  };

  const lockLang = packId ? LOCK_LANG[packId] || null : null;

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
          <div className="flex-1 grid place-items-center">
            <div className="text-center max-w-sm">
              <div className="seal w-14 h-14 mx-auto flex items-center justify-center text-2xl font-bold mb-5">微</div>
              <h3 className="font-display text-xl font-bold mb-3">一小点，一小步</h3>
              <p className="text-sm text-ink-soft leading-relaxed">
                每个知识点只讲一小段（≤300 字 + 一个示例），
                马上动手做小题，错了给提示不给答案，改对再巩固，
                你点「下一个」才前进。小节有小总结，模块有大总结。
              </p>
              <p className="text-xs text-ink-faint mt-4">先在左栏安装语言包，再点「开始学习」。进度记在服务器，换电脑接着学。</p>
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