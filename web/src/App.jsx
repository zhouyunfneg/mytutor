import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Learn from './pages/Learn.jsx';
import Practice from './pages/Practice.jsx';
import Notes from './pages/Notes.jsx';
import Me from './pages/Me.jsx';
import { api } from './api.js';

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
        <div className="seal w-14 h-14 mx-auto flex items-center justify-center text-2xl font-bold mb-5">学</div>
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
  const [skin, setSkin] = useState(() => localStorage.getItem('mytutor-skin') || 'paper');

  useEffect(() => {
    localStorage.setItem('mytutor-skin', skin);
    document.documentElement.classList.toggle('theme-glass', skin === 'glass');
  }, [skin]);

  useEffect(() => {
    api
      .get('/api/me')
      .then((r) => setAuthed(r.authenticated || !r.has_password))
      .catch(() => setAuthed(false));
    const on401 = () => setAuthed(false);
    window.addEventListener('mytutor:unauthorized', on401);
    return () => window.removeEventListener('mytutor:unauthorized', on401);
  }, []);

  if (authed === null) {
    return <div className="h-full grid place-items-center text-xs text-ink-faint">…</div>;
  }
  if (!authed) return <Login onOk={() => setAuthed(true)} />;

  return (
    <div className="flex h-full">
      {/* 左侧导航 */}
      <aside className="w-[88px] shrink-0 border-r border-line bg-paper-deep/60 flex flex-col items-center py-5 gap-1">
        <div className="seal w-11 h-11 flex items-center justify-center text-xl font-bold mb-6 select-none">
          学
        </div>
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
              <Icon d={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-2.5">
          <button
            onClick={() => setSkin(skin === 'paper' ? 'glass' : 'paper')}
            title="切换全站皮肤"
            className="btn-ghost px-2.5 py-1 text-[10px] font-display tracking-wider"
          >
            {skin === 'paper' ? '毛玻璃' : '宣纸'}
          </button>
          <div className="text-[10px] text-ink-faint font-display tracking-widest">
            MyTutor
          </div>
        </div>
      </aside>

      {/* 主区域 */}
      <main className="flex-1 min-w-0 overflow-hidden">
        <Routes>
          <Route path="/" element={<Learn />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/library" element={<Navigate to="/notes" replace />} />
          <Route path="/me" element={<Me />} />
        </Routes>
      </main>
    </div>
  );
}