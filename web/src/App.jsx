import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Learn from './pages/Learn.jsx';
import Practice from './pages/Practice.jsx';
import Notes from './pages/Notes.jsx';
import Me from './pages/Me.jsx';
import { api } from './api.js';
import { useIsMobile } from './useIsMobile.js';

const LOGO = `${import.meta.env.BASE_URL}logo.svg`;

function Login({ onOk }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post('/api/login', { password: pw });
      if (r.ok) onOk();
      else setErr(r.error);
    } catch (e2) {
      setErr(String(e2.message || e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="h-full grid place-items-center p-6">
      <form onSubmit={submit} className="paper-card p-8 w-full max-w-sm fade-up">
        <img src={LOGO} alt="MyTutor" className="w-14 h-14 mx-auto mb-5 select-none" />
        <h1 className="font-display text-xl font-bold text-center mb-1">MyTutor</h1>
        <p className="text-xs text-ink-faint text-center mb-6">私人编程学习平台 · 口令进入</p>
        <input
          type="password"
          className="field w-full mb-3"
          placeholder="口令"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
        />
        {err && <p className="text-xs text-cinnabar mb-3">{err}</p>}
        <button className="btn-seal w-full py-2 text-sm" disabled={busy || !pw}>
          {busy ? '…' : '进入'}
        </button>
      </form>
    </div>
  );
}

const Icon = ({ d }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const NAV = [
  { to: '/', label: '学习', icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
  { to: '/practice', label: '练习', icon: 'M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' },
  { to: '/notes', label: '笔记', icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z M9.5 7h6 M9.5 11h4' },
  { to: '/me', label: '我的', icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
];

export default function App() {
  const [authed, setAuthed] = useState(null); // null= checking
  const [dueCount, setDueCount] = useState(0);
  const [version, setVersion] = useState('');
  // 点 LOGO 回主页：路由回 '/' 并发 home 信号，让 Learn 重置到默认页（保留代码区内容）
  const [homeTick, setHomeTick] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  useEffect(() => {
    api
      .get('/api/me')
      .then((r) => setAuthed(r.authenticated || !r.has_password))
      .catch(() => setAuthed(false));
    // 左下角版本号：运行时读 health，版本单一来源=server/main.py，提版本无需重build前端
    api.get('/api/health').then((r) => setVersion(r.version || '')).catch(() => {});
    const on401 = () => setAuthed(false);
    window.addEventListener('mytutor:unauthorized', on401);
    return () => window.removeEventListener('mytutor:unauthorized', on401);
  }, []);

  // 待复习徽标：进入页面 / 切换页面 / 练习页判题后刷新
  useEffect(() => {
    if (!authed) return;
    const load = () =>
      api.get('/api/practice/overview').then((r) => setDueCount(r.due_count || 0)).catch(() => {});
    load();
    window.addEventListener('mytutor:practice', load);
    return () => window.removeEventListener('mytutor:practice', load);
  }, [authed, location.pathname]);

  if (authed === null) {
    return <div className="h-full grid place-items-center text-xs text-ink-faint">…</div>;
  }
  if (!authed) return <Login onOk={() => setAuthed(true)} />;

  const routes = (
    <Routes>
      <Route path="/" element={<Learn homeTick={homeTick} />} />
      <Route path="/practice" element={<Practice />} />
      <Route path="/notes" element={<Notes />} />
      <Route path="/library" element={<Navigate to="/notes" replace />} />
      <Route path="/me" element={<Me />} />
    </Routes>
  );

  // 手机：底部四页签替代左侧栏；主区域占满剩余高度，页签在正常流里不遮挡内容
  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        <main className="flex-1 min-h-0 overflow-hidden">{routes}</main>
        <nav className="mobile-tabbar shrink-0 flex items-stretch border-t border-line px-1 pt-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              onClick={() => { if (n.to === '/') setHomeTick((t) => t + 1); }}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[52px] py-1.5 rounded-lg text-[10px] transition-colors ${
                  isActive ? 'text-cinnabar font-medium' : 'text-ink-faint'
                }`
              }
            >
              <span className="relative">
                <Icon d={n.icon} />
                {n.to === '/practice' && dueCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-cinnabar text-paper text-[9px] font-mono font-bold leading-[15px] text-center">
                    {dueCount > 9 ? '9+' : dueCount}
                  </span>
                )}
              </span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* 左侧导航 */}
      <aside className="w-[88px] shrink-0 border-r border-line bg-paper-deep/60 flex flex-col items-center py-5 gap-1">
        <button
          type="button"
          onClick={() => { navigate('/'); setHomeTick((t) => t + 1); }}
          title="回到主页 · 默认页面"
          aria-label="回到主页（默认页面）"
          className="mb-5 p-1 -m-1 rounded-2xl cursor-pointer transition-all hover:bg-card/70 hover:shadow-sm hover:scale-[1.04] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cinnabar/40"
        >
          <img src={LOGO} alt="MyTutor" className="w-11 h-11 select-none" />
        </button>
        <nav className="flex flex-col gap-2 w-full px-3 stagger">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs transition-all ${
                  isActive
                    ? 'bg-card text-cinnabar border border-line shadow-sm font-medium'
                    : 'text-ink-soft hover:bg-card/60 border border-transparent'
                }`
              }
            >
              <span className="relative">
                <Icon d={n.icon} />
                {n.to === '/practice' && dueCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-cinnabar text-paper text-[9px] font-mono font-bold leading-[15px] text-center">
                    {dueCount > 9 ? '9+' : dueCount}
                  </span>
                )}
              </span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto text-[10px] text-ink-faint font-mono" title="当前版本">
          {version ? `v${version}` : ''}
        </div>
      </aside>

      {/* 主区域 */}
      <main className="flex-1 min-w-0 overflow-hidden">{routes}</main>
    </div>
  );
}