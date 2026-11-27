import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from './api.js';

const QUEUE_KEY = 'mytutor-activity-queue-v1';
const IDLE_MS = 120_000;
const SESSION_GAP_MS = 600_000;
const HEARTBEAT_MS = 15_000;
const MAX_QUEUE = 6000; // 15 秒一段，约 24 小时离线补报
const ActivityContext = createContext({ seconds: 0, active: false, sync: 'synced', reportContext: () => {} });

const kindOf = (path) => (
  path === '/' ? 'learn' : path === '/practice' ? 'practice' : path === '/notes' ? 'notes' : null
);
const iso = (ms) => new Date(ms).toISOString();
const newId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : `${m}:${String(s % 60).padStart(2, '0')}`;
};

function readQueue() {
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((x) => x && x.id && x.start && x.end).slice(-MAX_QUEUE) : [];
  } catch {
    return [];
  }
}

export function StudyTimerProvider({ children }) {
  const location = useLocation();
  const [view, setView] = useState({ seconds: 0, active: false, sync: 'synced' });
  const control = useRef(null);
  // 子页面的 effect 可能先于 Provider 安装执行；先暂存，初始化与换页时再取。
  const pendingContext = useRef(null);

  const reportContext = useCallback((ctx) => {
    pendingContext.current = ctx;
    control.current?.setContext(ctx);
  }, []);

  useEffect(() => {
    let disposed = false;
    let heartbeat;
    let tick;
    const queue = readQueue();
    let sending = false;
    let path = location.pathname;
    let context = pendingContext.current;
    let visible = document.visibilityState === 'visible';
    let lastInput = 0;
    let segmentStart = null;
    let sessionSeconds = 0;
    let lastCreditEnd = null;

    const eligible = () => visible && !!kindOf(path);
    const activeNow = (now) => eligible() && lastInput > 0 && now <= lastInput + IDLE_MS;
    const persist = () => {
      try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE))); }
      catch { /* 隐私模式禁用存储时仍保留内存队列，当前会话可补报。 */ }
    };
    const setSync = (sync) => setView((v) => v.sync === sync ? v : { ...v, sync });
    const enqueue = (item) => {
      queue.push(item);
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
      persist();
      setSync(navigator.onLine === false ? 'offline' : 'pending');
    };

    async function drain() {
      if (disposed || sending || !queue.length) return;
      sending = true;
      const batch = queue.slice(0, 300);
      let failed = false;
      try {
        const r = await api.post('/api/activity/heartbeat', { segments: batch });
        if (r?.ok === false) throw new Error(r.error || '学习时长上报失败');
        const ids = new Set(batch.map((x) => x.id));
        for (let i = queue.length - 1; i >= 0; i--) {
          if (ids.has(queue[i].id)) queue.splice(i, 1);
        }
        persist();
        setSync(navigator.onLine === false ? 'offline' : 'synced');
        window.dispatchEvent(new Event('mytutor:activity'));
      } catch {
        failed = true;
        setSync('offline');
      } finally {
        sending = false;
        if (!failed && queue.length) drain();
      }
    }

    function startSegment(now) {
      if (segmentStart !== null || !eligible()) return;
      if (lastCreditEnd !== null && now - lastCreditEnd > SESSION_GAP_MS) sessionSeconds = 0;
      segmentStart = now;
    }

    function flush(now, hardStop = false) {
      if (segmentStart === null) return;
      const end = hardStop || !eligible() ? now : Math.min(now, lastInput + IDLE_MS);
      const start = segmentStart;
      segmentStart = null;
      const seconds = (end - start) / 1000;
      if (seconds >= 1) {
        const kind = kindOf(path);
        enqueue({
          id: newId(), start: iso(start), end: iso(end), kind,
          pack_id: context?.pack_id || '', pack_name: context?.pack_name || '',
          point_id: context?.point_id || '', title: context?.title || '',
        });
        sessionSeconds += seconds;
        lastCreditEnd = end;
      }
    }

    function beacon() {
      if (!queue.length || typeof navigator.sendBeacon !== 'function') return;
      try { api.beacon('/api/activity/heartbeat', { segments: queue.slice(-300) }); }
      catch { /* 下次上线仍会从本地队列补报。 */ }
    }

    function onActivity() {
      if (!visible) return;
      const now = Date.now();
      lastInput = now;
      startSegment(now);
    }

    function onVisibility() {
      const now = Date.now();
      visible = document.visibilityState === 'visible';
      if (!visible) {
        flush(now, true);
        beacon();
        drain();
      } else {
        // 回到前台本身视为一次操作；隐藏期间不会补记。
        lastInput = now;
        startSegment(now);
        drain();
      }
    }

    function onOnline() { if (navigator.onLine !== false) drain(); }
    function onOffline() { setSync('offline'); }
    function onPageHide() {
      flush(Date.now(), true);
      beacon();
    }

    control.current = {
      setContext(next) {
        const now = Date.now();
        flush(now, true);
        context = next && typeof next === 'object' ? next : null;
        startSegment(now);
      },
      setPath(next) {
        if (next === path) return;
        const now = Date.now();
        flush(now, true);
        path = next;
        context = pendingContext.current;
        startSegment(now);
      },
    };

    const events = ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('pagehide', onPageHide);

    tick = setInterval(() => {
      const now = Date.now();
      if (segmentStart !== null && !activeNow(now)) flush(now);
      if (activeNow(now)) startSegment(now);
      if (segmentStart === null && lastCreditEnd !== null && now - lastCreditEnd > SESSION_GAP_MS) {
        sessionSeconds = 0;
        lastCreditEnd = null;
      }
      const live = sessionSeconds + (segmentStart === null ? 0
        : Math.max(0, Math.min(now, lastInput + IDLE_MS) - segmentStart) / 1000);
      const seconds = Math.floor(live);
      const active = segmentStart !== null && activeNow(now);
      setView((v) => v.seconds === seconds && v.active === active ? v : { ...v, seconds, active });
    }, 1000);

    heartbeat = setInterval(() => {
      const now = Date.now();
      flush(now);
      if (activeNow(now)) startSegment(now);
      drain();
    }, HEARTBEAT_MS);

    persist();
    if (queue.length) drain();
    return () => {
      disposed = true;
      flush(Date.now(), true);
      clearInterval(tick);
      clearInterval(heartbeat);
      events.forEach((name) => window.removeEventListener(name, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('pagehide', onPageHide);
      control.current = null;
    };
  }, []); // 路由通过下面的 effect 推送，计时器不因页面切换重装。

  useEffect(() => { control.current?.setPath(location.pathname); }, [location.pathname]);

  const value = { ...view, reportContext };
  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useStudyTimer() {
  return useContext(ActivityContext);
}

export function StudyTimerBadge() {
  const { seconds, active, sync } = useStudyTimer();
  return (
    <span
      data-testid="study-timer"
      title={`本次有效学习 ${formatTime(seconds)} · ${active ? '正在计时' : '已暂停'} · 2 分钟无操作自动暂停${sync === 'offline' ? ' · 离线记录待同步' : ''}`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line/70 bg-card/50 px-2 py-1 text-[10px] text-ink-faint"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
      </svg>
      <span className="font-mono">本次 {formatTime(seconds)}</span>
      <span className={`w-1.5 h-1.5 rounded-full ${sync === 'offline' ? 'bg-cinnabar' : active ? 'bg-pine' : 'bg-ink-faint/50'}`} />
    </span>
  );
}
