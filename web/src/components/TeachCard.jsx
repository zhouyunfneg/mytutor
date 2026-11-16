import { useState } from 'react';
import { api } from '../api.js';
import Rich from './Rich.jsx';

const STEPS = ['讲解', '出题', '纠错', '巩固'];
const STEP_IDX = {
  explain: 0,
  exercise: 1,
  correcting: 2,
  consolidate: 3,
  consolidate_correcting: 2,
};

export default function TeachCard({ packId, session, refresh, code, onLoadStarter }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const call = async (path, body) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post(`/api/teach/${packId}/${path}`, body);
      if (r && r.ok === false) setErr(r.error);
      await refresh();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  if (!session || session.step === 'none') {
    return (
      <div className="flex-1 grid place-items-center">
        <div className="text-center max-w-sm">
          <div className="seal w-14 h-14 mx-auto flex items-center justify-center text-2xl font-bold mb-5">微</div>
          <h3 className="font-display text-xl font-bold mb-3">一小点，一小步</h3>
          <p className="text-sm text-ink-soft leading-relaxed mb-5">
            每个知识点只讲一小段（≤300 字 + 一个示例），马上动手做小题，
            错了给提示不给答案，改对再巩固，你点「下一个」才前进。
          </p>
          <button className="btn-seal px-6 py-2 text-sm" disabled={busy} onClick={() => call('start', {})}>
            {busy ? 'AI 备课中…' : '开始学习'}
          </button>
          {err && <p className="text-xs text-cinnabar mt-3">{err}</p>}
        </div>
      </div>
    );
  }

  const s = session;
  const p = s.point;
  const idx = STEP_IDX[s.step];
  const done = ['point_done', 'section_summary', 'module_summary', 'pack_done'].includes(s.step);
  const ex = s.step.startsWith('consolidate') ? s.consolidate : s.exercise;
  const isCorrecting = s.step === 'correcting' || s.step === 'consolidate_correcting';

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 步骤trail */}
      <div className="flex items-center justify-between mb-4">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold whitespace-nowrap truncate">
            {p ? p.title : '学习'}
          </h2>
          {p && (
            <div className="text-[11px] text-ink-faint truncate">
              {p.module_title} / {p.section_title}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div className={`step-dot ${done ? 'done' : i === idx ? 'active' : i < idx ? 'done' : ''}`} />
                <span className="text-[10px] text-ink-faint whitespace-nowrap">{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className="w-5 h-px bg-line mb-4" />}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-4">
        {err && (
          <div className="text-xs text-cinnabar bg-cinnabar/5 border border-cinnabar/30 rounded-lg px-3 py-2">
            {err}
          </div>
        )}

        {s.step === 'explain' && (
          <>
            <Rich text={s.explain} />
            <div className="mt-auto pt-2">
              <button className="btn-seal px-5 py-2 text-sm" disabled={busy} onClick={() => call('step')}>
                {busy ? 'AI 出题中…' : '看懂了，出题'}
              </button>
            </div>
          </>
        )}

        {(s.step === 'exercise' || s.step === 'consolidate' || isCorrecting) && ex && (
          <>
            <div className="bg-paper-deep/70 border border-line rounded-lg px-4 py-3">
              <div className="text-[10px] tracking-widest text-ink-faint mb-1.5">
                {s.step.startsWith('consolidate') ? '巩固 · 变式题' : '动手小题'}
                {s.attempts > 0 && ` · 已提交 ${s.attempts} 次`}
              </div>
              <p className="text-sm leading-relaxed">{ex.task}</p>
            </div>
            {isCorrecting && s.hint && (
              <div className="border-l-2 border-cinnabar bg-cinnabar/5 px-4 py-3 rounded-r-lg">
                <div className="text-[10px] tracking-widest text-cinnabar mb-1">提示 · 不给答案</div>
                <p className="text-sm leading-relaxed text-ink-soft">{s.hint}</p>
              </div>
            )}
            {s.last_output && isCorrecting && (
              <pre className="bg-night text-paper/80 rounded-lg px-3 py-2 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto">
                {s.last_output}
              </pre>
            )}
            <div className="mt-auto pt-2 flex items-center gap-2 flex-wrap">
              {ex.starter ? (
                <button
                  className="btn-ghost px-4 py-2 text-xs"
                  onClick={() => onLoadStarter(ex.starter)}
                >
                  载入起始代码
                </button>
              ) : null}
              <button className="btn-seal px-5 py-2 text-sm" disabled={busy} onClick={() => call('submit', { code })}>
                {busy ? '判题中…' : '提交答案'}
              </button>
              <span className="text-[11px] text-ink-faint">在右侧代码区写，写完提交</span>
            </div>
          </>
        )}

        {s.step === 'point_done' && (
          <div className="flex-1 grid place-items-center">
            <div className="text-center">
              <div className="seal w-14 h-14 mx-auto flex items-center justify-center text-2xl font-bold mb-4">过</div>
              <h3 className="font-display text-lg font-bold mb-2">这个点拿下了</h3>
              <p className="text-xs text-ink-faint mb-5">原题 + 变式题都判对，进度已记录。</p>
              <button className="btn-seal px-6 py-2 text-sm" disabled={busy} onClick={() => call('advance')}>
                {busy ? '…' : '下一个'}
              </button>
            </div>
          </div>
        )}

        {(s.step === 'section_summary' || s.step === 'module_summary') && (
          <>
            <div className="text-[10px] tracking-widest text-pine mb-1">
              {s.step === 'section_summary' ? '小节 · 小总结' : '模块 · 大总结'}
            </div>
            <Rich text={s.summary} />
            <div className="mt-auto pt-2">
              <button className="btn-seal px-5 py-2 text-sm" disabled={busy} onClick={() => call('advance')}>
                {busy ? '…' : '继续'}
              </button>
            </div>
          </>
        )}

        {s.step === 'pack_done' && (
          <div className="flex-1 grid place-items-center">
            <div className="text-center">
              <div className="seal w-14 h-14 mx-auto flex items-center justify-center text-2xl font-bold mb-4">成</div>
              <h3 className="font-display text-lg font-bold mb-2">本语言包技能树走完</h3>
              <p className="text-xs text-ink-faint">去左栏换一门语言，或等技能树扩充后再来。</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}