import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const TZ = 'Asia/Shanghai';
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const Gear = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3v-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.5 1h.09v4h-.09A1.7 1.7 0 0 0 19.4 15z" />
  </svg>
);

const Clock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
);

const fmtDuration = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
  if (m) return `${m} 分钟`;
  return s ? `${s} 秒` : '0 分钟';
};

const fmtShort = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (s >= 3600) return `${Math.floor(s / 3600)}h${s % 3600 >= 60 ? ` ${Math.floor((s % 3600) / 60)}m` : ''}`;
  if (s >= 60) return `${Math.floor(s / 60)}m`;
  return s ? `${s}s` : '0';
};

const dayKey = (iso) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const clockText = (iso) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(iso));

const dateText = (key) => {
  const [, m, d] = key.split('-');
  return `${Number(m)}月${Number(d)}日`;
};

function StatCard({ label, value, note, tone = 'text-ink' }) {
  return (
    <div className="paper-card px-4 py-4 min-w-0">
      <div className="text-[11px] text-ink-faint mb-2">{label}</div>
      <div className={`font-display text-xl font-bold leading-tight ${tone}`}>{value}</div>
      {note && <div className="text-[10px] text-ink-faint mt-1.5 truncate" title={note}>{note}</div>}
    </div>
  );
}

function WeekChart({ days, today }) {
  const max = Math.max(60, ...days.map((d) => d.seconds));
  return (
    <div className="paper-card p-5 fade-up">
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <h2 className="font-display text-base font-bold">最近 7 天</h2>
        <span className="text-[11px] text-ink-faint">每天有效学习时长</span>
      </div>
      <div className="flex items-end gap-2 sm:gap-3 h-40" role="img" aria-label="最近七天学习时长柱状图">
        {days.map((d) => {
          const pct = d.seconds ? Math.max(5, Math.round(d.seconds * 100 / max)) : 0;
          const weekday = WEEKDAYS[new Date(`${d.date}T12:00:00+08:00`).getDay()];
          const isToday = d.date === today;
          return (
            <div key={d.date} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1.5">
              <span className={`text-[9px] font-mono ${d.seconds ? 'text-ink-soft' : 'text-ink-faint/60'}`}>{fmtShort(d.seconds)}</span>
              <div className="w-full max-w-9 h-24 flex items-end bg-paper-deep/45 rounded-t-md overflow-hidden">
                <div
                  className={`w-full rounded-t-md transition-all ${isToday ? 'bg-cinnabar' : 'bg-pine/75'}`}
                  style={{ height: `${pct}%` }}
                  title={`${dateText(d.date)} · ${fmtDuration(d.seconds)}`}
                />
              </div>
              <span className={`text-[10px] ${isToday ? 'text-cinnabar font-medium' : 'text-ink-faint'}`}>{isToday ? '今天' : weekday}</span>
              <span className="text-[9px] text-ink-faint/70 font-mono">{Number(d.date.slice(5, 7))}/{Number(d.date.slice(8))}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecentSessions({ sessions, today }) {
  return (
    <div className="paper-card p-5 fade-up">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-display text-base font-bold">最近单次学习</h2>
        <span className="text-[11px] text-ink-faint">离开超过 10 分钟算新的一次</span>
      </div>
      {sessions.length === 0 ? (
        <p className="text-xs text-ink-faint py-6 text-center">完成一次有效学习后，这里会出现记录。</p>
      ) : (
        <div className="divide-y divide-line/60">
          {sessions.map((s, i) => {
            const key = dayKey(s.started_at);
            const when = key === today ? `今天 ${clockText(s.started_at)}`
              : key === dayKey(new Date(Date.now() - 86400000).toISOString()) ? `昨天 ${clockText(s.started_at)}`
                : `${dateText(key)} ${clockText(s.started_at)}`;
            const content = s.title || s.pack_name || '通用学习';
            return (
              <div key={`${s.started_at}-${i}`} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
                <div className="w-20 shrink-0">
                  <div className="font-mono text-sm font-bold text-ink">{fmtDuration(s.duration_s)}</div>
                  <div className="text-[10px] text-ink-faint mt-0.5">{s.kind_label}{s.mixed ? ' · 综合' : ''}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate" title={content}>{content}</div>
                  <div className="text-[10px] text-ink-faint mt-1 truncate">
                    {when}{s.pack_name ? ` · ${s.pack_name}` : ''}
                  </div>
                </div>
                {Object.keys(s.by_kind || {}).length > 1 && (
                  <div className="hidden sm:block text-right text-[10px] text-ink-faint shrink-0">
                    {Object.entries(s.by_kind).map(([k, v]) => <div key={k}>{k} {fmtShort(v)}</div>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PackDistribution({ packs }) {
  return (
    <div className="paper-card p-5 fade-up">
      <h2 className="font-display text-base font-bold mb-4">语言包分布</h2>
      {packs.length === 0 ? (
        <p className="text-xs text-ink-faint">关联语言的学习记录会显示在这里。</p>
      ) : (
        <div className="flex flex-col gap-3">
          {packs.map((p) => (
            <div key={p.id}>
              <div className="flex items-baseline justify-between gap-3 text-xs mb-1.5">
                <span className="font-medium truncate">{p.name}</span>
                <span className="text-ink-faint font-mono shrink-0">{fmtDuration(p.seconds)} · {p.percent}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-paper-deep overflow-hidden">
                <div className="h-full rounded-full bg-pine/75" style={{ width: `${Math.max(2, p.percent)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Me() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.get('/api/activity/summary'));
      setErr('');
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('mytutor:activity', load);
    const timer = setInterval(load, 60_000);
    return () => {
      window.removeEventListener('mytutor:activity', load);
      clearInterval(timer);
    };
  }, [load]);

  if (!data) {
    return (
      <div className="h-full grid place-items-center p-6">
        <div className="text-center">
          <p className="text-sm text-ink-faint">{err || '学习统计加载中…'}</p>
          {err && <button className="btn-ghost px-4 py-1.5 text-xs mt-3" onClick={load}>重试</button>}
        </div>
      </div>
    );
  }

  const today = dayKey(data.server_time);
  const since = data.tracking_since ? dateText(dayKey(data.tracking_since)) : null;
  const kinds = [
    ['课程学习', data.today_by_kind?.课程学习 || 0],
    ['练习', data.today_by_kind?.练习 || 0],
    ['笔记', data.today_by_kind?.笔记 || 0],
  ];

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <div className="max-w-4xl mx-auto pb-8 flex flex-col gap-4">
        <div className="flex items-start gap-3 fade-up">
          <div className="seal w-11 h-11 shrink-0 grid place-items-center text-xl font-bold">学</div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-bold">我的</h1>
            <p className="text-xs text-ink-faint mt-1 leading-relaxed">
              只统计前台有效学习，不把挂机算进去。{since ? `自 ${since} 起记录。` : '从第一次有效学习开始记录。'}
            </p>
          </div>
          <button type="button" onClick={() => navigate('/settings')} className="btn-ghost shrink-0 text-xs px-3 min-h-[40px] inline-flex items-center gap-1.5">
            <Gear /> 设置
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          <StatCard label="今日学习" value={fmtDuration(data.today_seconds)} tone="text-cinnabar" note={kinds.map(([k, v]) => `${k} ${fmtShort(v)}`).join(' · ')} />
          <StatCard label="本周学习" value={fmtDuration(data.week_seconds)} note="按周一至今天统计" />
          <StatCard label="累计学习" value={fmtDuration(data.total_seconds)} tone="text-pine-deep" note={data.total_seconds ? '所有已记录的有效学习' : '还没有学习记录'} />
          <StatCard label="连续学习" value={`${data.streak_days} 天`} note="每天满 1 分钟记一个学习日" />
        </div>

        {data.total_seconds === 0 && (
          <div className="paper-card p-6 sm:p-8 text-center fade-up">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full border border-line bg-card/60 grid place-items-center text-ink-soft"><Clock /></div>
            <h2 className="font-display text-lg font-bold mb-2">学习记录从今天开始</h2>
            <p className="text-sm text-ink-soft leading-relaxed max-w-lg mx-auto">
              去学习、练习或笔记页实际操作即可计时。页面在前台且有操作时累计，超过 2 分钟无操作或切到后台会自动暂停。
            </p>
            <button className="btn-seal px-5 py-2 text-sm mt-5" onClick={() => navigate('/')}>开始学习</button>
          </div>
        )}

        <WeekChart days={data.days} today={today} />
        <RecentSessions sessions={data.recent} today={today} />
        <PackDistribution packs={data.packs} />

        <p className="text-[11px] text-ink-faint leading-relaxed px-1">
          统计口径：学习、练习、笔记三个页面；多个标签页重叠只计一次；离线记录会在恢复网络后补报。完全静止阅读超过 2 分钟会暂停，统计数据不是精确的专注度测量。
        </p>
        {err && <p className="text-xs text-cinnabar">统计刷新失败：{err}</p>}
      </div>
    </div>
  );
}
