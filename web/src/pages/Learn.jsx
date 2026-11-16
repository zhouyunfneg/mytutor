import { useCallback, useEffect, useState } from 'react';
import CodePanel from '../components/CodePanel.jsx';
import PackPanel from '../components/PackPanel.jsx';
import TeachCard from '../components/TeachCard.jsx';
import { api } from '../api.js';

const LOCK_LANG = { python: 'python', javascript: 'javascript', typescript: 'typescript', 'html-css': 'html' };

export default function Learn() {
  const [packId, setPackId] = useState(null);
  const [session, setSession] = useState(null);
  const [mirror, setMirror] = useState({ lang: 'python', code: '' });
  const [inject, setInject] = useState(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('mytutor-book-collapsed') === '1');

  useEffect(() => {
    localStorage.setItem('mytutor-book-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

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
      {/* 左：学习书，可收纳成窄轨，把空间让给讲解和代码区 */}
      <div
        className="shrink-0 paper-card fade-up relative overflow-hidden"
        style={{ width: collapsed ? 46 : bookOpen ? 320 : 230, transition: 'width 0.25s ease' }}
      >
        {/* 收纳态：窄轨（展开按钮 + 竖排书名 + 进度） */}
        <div
          className="absolute inset-0 flex-col items-center py-3 gap-3"
          style={{ display: collapsed ? 'flex' : 'none' }}
        >
          <button
            onClick={() => setCollapsed(false)}
            title="展开学习书"
            className="btn-ghost w-7 h-7 grid place-items-center text-xs leading-none shrink-0"
          >
            »
          </button>
          <span
            className="font-display text-xs text-ink-soft tracking-widest select-none"
            style={{ writingMode: 'vertical-rl' }}
          >
            学习书
          </span>
          {session?.done_points?.length > 0 && (
            <span
              className="mt-auto text-[10px] font-mono text-pine select-none"
              style={{ writingMode: 'vertical-rl' }}
              title={`已学 ${session.done_points.length} 点`}
            >
              已学{session.done_points.length}点
            </span>
          )}
        </div>

        {/* 书内容：收纳时只隐藏不卸载，展开后仍在原目录位置 */}
        <div className="h-full p-4" style={{ width: bookOpen ? 320 : 230, display: collapsed ? 'none' : 'block' }}>
          <button
            onClick={() => setCollapsed(true)}
            title="收纳学习书，专心当前内容"
            className="absolute top-2.5 right-2.5 z-10 btn-ghost px-1.5 py-0.5 text-xs leading-none"
          >
            «
          </button>
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