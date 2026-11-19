import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Rich from './Rich.jsx';
import Diagram from './Diagram.jsx';

const LOGO = `${import.meta.env.BASE_URL}logo.svg`;

const STEPS = ['讲解', '出题', '纠错', '巩固'];
// 问答面板按提问时所处阶段分组（旧会话无 step 字段 → 归入"之前的问答"）
const QA_STEP_LABEL = {
  explain: '讲解时问过',
  exercise: '出题时问过',
  correcting: '纠错时问过',
  consolidate: '巩固时问过',
  consolidate_correcting: '巩固时问过',
};
const STEP_IDX = {
  explain: 0,
  exercise: 1,
  correcting: 2,
  consolidate: 3,
  consolidate_correcting: 2,
};

const ArrowRight = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
  </svg>
);

export default function TeachCard({ packId, session, refresh, code, onLoadStarter }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // 讲解阶段「问老师」：独立 asking，不占用出题按钮的 busy
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askErr, setAskErr] = useState(null);
  const [pendingQ, setPendingQ] = useState(null);
  const [clarifying, setClarifying] = useState(false);
  // 做题/巩固阶段「换一题」：坏题卡壳的出口，独立 changing，不占用提交按钮的 busy
  const [changing, setChanging] = useState(false);
  // 正文双页签：content=讲解/题目，qa=问老师独立面板；问答不再和题面混排
  const [bodyTab, setBodyTab] = useState('content');
  // 选择/判断题：当前选中选项下标（null=未选）；换题/换阶段复位
  const [picked, setPicked] = useState(null);
  const qaEndRef = useRef(null);
  const taRef = useRef(null);

  const qaCount = session?.qa?.length || 0;
  // 新问答出现时滚到视野底部（仅在问答页签激活时）
  useEffect(() => {
    if (bodyTab === 'qa' && (qaCount || pendingQ)) qaEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [qaCount, pendingQ, bodyTab]);
  // 阶段/知识点变化（出题、纠错、巩固、下一个点）→ 切回内容页签，题面与提示优先可见
  const stepNow = session?.step;
  const pointNow = session?.point_id;
  useEffect(() => { setBodyTab('content'); setPicked(null); }, [stepNow, pointNow]);
  // 提问框随内容长高（上限 112px），清空后复位；未超上限不露滚动条
  useEffect(() => {
    const el = taRef.current;
    if (el) {
      el.style.height = 'auto';
      const full = el.scrollHeight;
      el.style.height = Math.min(full, 112) + 'px';
      el.style.overflowY = full > 112 ? 'auto' : 'hidden';
    }
  }, [question]);

  const ask = async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setAskErr(null);
    setPendingQ(q);
    setQuestion('');
    setBodyTab('qa'); // 提问即切到问答页签，思考中与回答都在独立面板里看
    try {
      const r = await api.post(`/api/teach/${packId}/ask`, { question: q });
      if (r && r.ok === false) setAskErr(r.error);
      await refresh();
    } catch (e) {
      setAskErr(String(e.message || e));
    } finally {
      setAsking(false);
      setPendingQ(null);
    }
  };

  // 出题阶段「题目提示」：帮读题，不给答案；独立 clarifying，不占用提交按钮的 busy
  const clarifyTask = async () => {
    if (clarifying) return;
    setClarifying(true);
    setErr(null);
    try {
      const r = await api.post(`/api/teach/${packId}/clarify`);
      if (r && r.ok === false) setErr(r.error);
      await refresh();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setClarifying(false);
    }
  };

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

  // 换一题：重生成当前题（不跳知识点）；代码题换题后自动载入新骨架，选择题复位选中
  const changeProblem = async () => {
    setChanging(true);
    setErr(null);
    try {
      const r = await api.post(`/api/teach/${packId}/newproblem`, {});
      if (r && r.ok === false) { setErr(r.error); return; }
      await refresh();
      setPicked(null); // 换题可能仍在同一步骤（exercise→exercise），阶段 effect 不会触发，手动复位
      const nx = r?.step?.startsWith('consolidate') ? r.consolidate : r.exercise;
      if (nx && nx.judge?.mode !== 'choice' && nx.starter) onLoadStarter(nx.starter);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setChanging(false);
    }
  };

  if (!session || session.step === 'none') {
    return (
      <div className="flex-1 grid place-items-center">
        <div className="text-center max-w-md px-6">
          <img src={LOGO} alt="MyTutor" className="w-14 h-14 mx-auto mb-5 select-none" />
          <h3 className="font-display text-xl font-bold mb-3">一小点，一小步</h3>
          <p className="text-[15px] leading-8 text-ink-soft mb-6">
            每个知识点只讲一小段，配一个示例；
            马上动手做小题，错了给提示不给答案，
            改对再做一道变式题巩固，你点「下一个」才前进。
          </p>
          <button className="btn-seal px-7 py-2.5 text-sm" disabled={busy} onClick={() => call('start', {})}>
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
  const isChoice = ex?.judge?.mode === 'choice';
  const isCorrecting = s.step === 'correcting' || s.step === 'consolidate_correcting';
  const inTask = ['exercise', 'consolidate', 'correcting', 'consolidate_correcting'].includes(s.step);
  // 讲解 + 做题诸阶段都可「问老师」，随时遇到疑问随时问
  const askable = s.step === 'explain' || inTask;
  // 有问答（或正在提问）才出现页签；否则正文直接渲染内容，不加空页签噪音
  const qaVisible = askable && (qaCount > 0 || !!pendingQ);
  const tab = qaVisible ? bodyTab : 'content';

  // 底栏动作：每个步骤一个主动作，固定在卡片底部，不随正文滚动
  let actions = null;
  if (s.step === 'explain') {
    actions = (
      <button className="btn-seal px-6 py-2.5 text-sm inline-flex items-center gap-2" disabled={busy || asking} onClick={() => call('step')}>
        {busy ? 'AI 出题中…' : <>看懂了，出题 <ArrowRight /></>}
      </button>
    );
  } else if (inTask && ex) {
    actions = (
      <div className="flex items-center gap-3 flex-wrap">
        <button
          className="btn-seal px-6 py-2.5 text-sm"
          disabled={busy || asking || changing || (isChoice && picked === null)}
          onClick={() => call('submit', isChoice ? { choice: picked } : { code })}
        >
          {busy ? '判题中…' : isCorrecting ? (isChoice ? '重选好了，再提交' : '改好了，再提交') : '提交答案'}
        </button>
        <button className="btn-ghost px-4 py-2 text-xs" disabled={clarifying || busy || changing} onClick={clarifyTask}>
          {clarifying ? '读题中…' : '题目提示'}
        </button>
        <button className="btn-ghost px-4 py-2 text-xs" disabled={changing || busy || asking} onClick={changeProblem}>
          {changing ? '换题中…' : '换一题'}
        </button>
        {!isChoice && ex.starter ? (
          <button className="btn-ghost px-4 py-2 text-xs" onClick={() => onLoadStarter(ex.starter)}>
            载入起始代码
          </button>
        ) : null}
        <span className="text-xs text-ink-faint">
          {isChoice ? '选一个答案再提交；提示只指方向' : '在右侧代码区写，写完提交'}
        </span>
      </div>
    );
  } else if (s.step === 'point_done') {
    actions = (
      <button className="btn-seal px-6 py-2.5 text-sm inline-flex items-center gap-2" disabled={busy} onClick={() => call('advance')}>
        {busy ? 'AI 备课中…' : <>下一个 <ArrowRight /></>}
      </button>
    );
  } else if (s.step === 'section_summary' || s.step === 'module_summary') {
    actions = (
      <button className="btn-seal px-6 py-2.5 text-sm inline-flex items-center gap-2" disabled={busy} onClick={() => call('advance')}>
        {busy ? 'AI 备课中…' : <>继续 <ArrowRight /></>}
      </button>
    );
  }

  // 师生问答独立面板：只在「问老师」页签渲染，按提问阶段分组；跨阶段保留（start 新点才清空）
  const qaGroupLabel = (step) => QA_STEP_LABEL[step] || '之前的问答';
  const qaPanel = (
    <div className="flex flex-col gap-4">
      <div className="text-[11px] tracking-widest text-ink-faint">问老师 · 只围绕这个点</div>
      {(s.qa || []).map((item, i) => {
        const prev = i > 0 ? (s.qa[i - 1].step || '') : null;
        const cur = item.step || '';
        return (
          <div key={i} className="flex flex-col gap-2">
            {cur !== prev && (
              <div className="flex items-center gap-2.5 text-[10px] tracking-widest text-ink-faint">
                <span className="w-4 h-px bg-line" />
                {qaGroupLabel(item.step)}
                <span className="flex-1 h-px bg-line/70" />
              </div>
            )}
            <div className="self-end max-w-[85%] bg-paper-deep/70 border border-line/70 rounded-xl rounded-br-sm px-3.5 py-2 text-[14px] leading-7 text-ink whitespace-pre-wrap">
              {item.q}
            </div>
            <div className="self-start max-w-[94%] flex flex-col gap-1.5">
              <span className="text-[11px] tracking-widest text-pine-deep">老师</span>
              <div className="bg-card/70 border border-line/70 rounded-xl rounded-bl-sm px-4 py-3 shadow-sm">
                <Rich text={item.a} onLoadCode={onLoadStarter} />
              </div>
            </div>
          </div>
        );
      })}
      {pendingQ && (
        <div className="flex flex-col gap-2">
          {((s.qa || []).length === 0 || (s.qa[s.qa.length - 1].step || '') !== s.step) && (
            <div className="flex items-center gap-2.5 text-[10px] tracking-widest text-ink-faint">
              <span className="w-4 h-px bg-line" />
              {qaGroupLabel(s.step)}
              <span className="flex-1 h-px bg-line/70" />
            </div>
          )}
          <div className="self-end max-w-[85%] bg-paper-deep/70 border border-line/70 rounded-xl rounded-br-sm px-3.5 py-2 text-[14px] leading-7 text-ink whitespace-pre-wrap">
            {pendingQ}
          </div>
          <div className="self-start inline-flex items-center gap-2 text-[13px] text-ink-faint">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-pine animate-pulse" />
            老师思考中…
          </div>
        </div>
      )}
      <div ref={qaEndRef} />
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 卡头：面包屑 → 知识点名 → 一句目标；步骤点独立一行 */}
      <div className="shrink-0 pb-4 border-b border-line/60">
        {p && (
          <div className="text-xs text-ink-faint mb-1.5 truncate">
            {p.module_title} <span className="mx-1 text-line">›</span> {p.section_title}
          </div>
        )}
        <h2 className="font-display text-xl font-bold leading-snug">
          {p ? p.title : '学习'}
        </h2>
        {p?.goal && (
          <p className="mt-1.5 text-[13px] leading-6 text-ink-soft">
            <span className="inline-block align-middle mr-2 px-1.5 py-px rounded text-[10px] tracking-widest bg-pine/10 text-pine-deep border border-pine/25">目标</span>
            {p.goal}
          </p>
        )}
        {!done && idx !== undefined && (
          <div className="flex items-center gap-2 mt-3.5">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className={`step-dot ${i === idx ? 'active' : i < idx ? 'done' : ''}`} />
                  <span className={`text-[11px] whitespace-nowrap ${i === idx ? 'text-ink font-medium' : 'text-ink-faint'}`}>{label}</span>
                </div>
                {i < STEPS.length - 1 && <div className="w-6 h-px bg-line" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 正文页签：内容（讲解/题目）与问老师分开，互不混排；有问答才出现 */}
      {qaVisible && (
        <div className="shrink-0 flex items-center gap-6 px-1 pt-3">
          <button
            type="button"
            onClick={() => setBodyTab('content')}
            className={`pb-2 text-[13px] border-b-2 transition-colors ${tab === 'content' ? 'border-cinnabar text-ink font-medium' : 'border-transparent text-ink-faint hover:text-ink-soft'}`}
          >
            {s.step === 'explain' ? '讲解' : '题目'}
          </button>
          <button
            type="button"
            onClick={() => setBodyTab('qa')}
            className={`pb-2 text-[13px] border-b-2 inline-flex items-center gap-1.5 transition-colors ${tab === 'qa' ? 'border-cinnabar text-ink font-medium' : 'border-transparent text-ink-faint hover:text-ink-soft'}`}
          >
            问老师
            {qaCount > 0 && (
              <span className="px-1.5 py-px rounded-full bg-paper-deep border border-line/70 text-[10px] text-ink-soft">{qaCount}</span>
            )}
          </button>
        </div>
      )}

      {/* 正文：限宽 680，内容短时垂直居中，长内容自然滚动 */}
      <div className="flex-1 min-h-0 overflow-y-auto py-6 px-1 flex">
        <div className="m-auto w-full max-w-[680px] flex flex-col gap-6">
          {err && (
            <div className="text-xs text-cinnabar bg-cinnabar/5 border border-cinnabar/30 rounded-lg px-3 py-2">
              {err}
            </div>
          )}

          {tab === 'qa' && qaPanel}

          {tab === 'content' && s.step === 'explain' && (
            <>
              <Rich text={s.explain} onLoadCode={onLoadStarter} />
              <Diagram spec={s.diagram} />
            </>
          )}

          {tab === 'content' && inTask && ex && (
            <>
              <div className="bg-paper-deep/60 border border-line rounded-xl px-5 py-4">
                <div className="text-[11px] tracking-widest text-ink-faint mb-2">
                  {s.step.startsWith('consolidate') ? '巩固 · 变式题' : isChoice ? '概念 · 选择 / 判断' : '动手小题'}
                  {s.attempts > 0 && ` · 已提交 ${s.attempts} 次`}
                </div>
                <p className="text-base leading-8 text-ink">{ex.task}</p>
              </div>
              {isChoice && (
                <div className="flex flex-col gap-2">
                  {ex.judge.options.map((opt, i) => {
                    const sel = picked === i;
                    const wasPick = isCorrecting && picked === null && s.last_choice === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setPicked(i)}
                        className={`text-left flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors ${
                          sel ? 'border-ink/60 bg-paper-deep/80'
                            : wasPick ? 'border-cinnabar/50 bg-cinnabar/5'
                              : 'border-line bg-card/60 hover:bg-paper-deep/50'
                        }`}
                      >
                        <span className={`shrink-0 w-6 h-6 rounded-full grid place-items-center text-[11px] font-mono font-bold ${
                          sel ? 'bg-ink text-paper'
                            : wasPick ? 'bg-cinnabar/15 text-cinnabar-deep'
                              : 'bg-paper-deep text-ink-soft border border-line/70'
                        }`}>{String.fromCharCode(65 + i)}</span>
                        <span className="flex-1 text-[14px] leading-7 text-ink">{opt}</span>
                        {wasPick && <span className="shrink-0 text-[10px] text-cinnabar-deep mt-1">上次选的</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {s.task_hint && (
                <div className="border-l-2 border-pine bg-pine/5 px-5 py-4 rounded-r-xl">
                  <div className="text-[11px] tracking-widest text-pine-deep mb-1.5">题目提示 · 帮你读题</div>
                  <p className="text-[15px] leading-8 text-ink-soft whitespace-pre-wrap">{s.task_hint}</p>
                </div>
              )}
              {isCorrecting && s.hint && (
                <div className="border-l-2 border-cinnabar bg-cinnabar/5 px-5 py-4 rounded-r-xl">
                  <div className="text-[11px] tracking-widest text-cinnabar mb-1.5">提示 · 不给答案</div>
                  <p className="text-[15px] leading-8 text-ink-soft">{s.hint}</p>
                </div>
              )}
              {s.last_output && isCorrecting && (
                <div className="rounded-xl overflow-hidden border border-line/80">
                  <div className="px-4 py-2 bg-paper-deep border-b border-line/70 text-[11px] tracking-widest text-ink-faint">
                    运行结果
                  </div>
                  <pre className="bg-night text-paper/80 px-4 py-3 text-xs leading-5 font-mono overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {s.last_output}
                  </pre>
                </div>
              )}
            </>
          )}

          {s.step === 'point_done' && (
            <div className="text-center py-8">
              <div className="seal w-16 h-16 mx-auto flex items-center justify-center text-3xl font-bold mb-5">过</div>
              <h3 className="font-display text-xl font-bold mb-2">这个点拿下了</h3>
              <p className="text-sm text-ink-soft">原题 + 变式题都判对，进度已记录。</p>
            </div>
          )}

          {(s.step === 'section_summary' || s.step === 'module_summary') && (
            <>
              <div className="text-[11px] tracking-widest text-pine-deep">
                {s.step === 'section_summary' ? '小节 · 小总结' : '模块 · 大总结'}
              </div>
              <Rich text={s.summary} />
            </>
          )}

          {s.step === 'pack_done' && (
            <div className="text-center py-8">
              <div className="seal w-16 h-16 mx-auto flex items-center justify-center text-3xl font-bold mb-5">成</div>
              <h3 className="font-display text-xl font-bold mb-2">本语言包技能树走完</h3>
              <p className="text-sm text-ink-soft">去左栏换一门语言，或等技能树扩充后再来。</p>
            </div>
          )}
        </div>
      </div>

      {/* 讲解 + 做题诸阶段：提问框，像老师一样互动；问完再点下方主动作 */}
      {askable && (
        <div className="shrink-0 border-t border-line/60 pt-3">
          {askErr && (
            <div className="text-xs text-cinnabar bg-cinnabar/5 border border-cinnabar/30 rounded-lg px-3 py-2 mb-2">
              {askErr}
            </div>
          )}
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <textarea
              ref={taRef}
              rows={1}
              className="field flex-1 resize-none text-[14px] leading-6 overflow-y-hidden"
              placeholder={inTask ? '做题卡住了？问老师…' : '对这个点有疑问？问老师…'}
              value={question}
              disabled={asking}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
            />
            <button
              type="submit"
              className="btn-ghost px-4 py-2 text-xs whitespace-nowrap disabled:opacity-50"
              disabled={asking || !question.trim()}
            >
              {asking ? '解答中…' : '问老师'}
            </button>
          </form>
        </div>
      )}

      {/* 底栏：主动作始终可见 */}
      {actions && (
        <div className={`shrink-0 flex items-center ${askable ? 'pt-3' : 'border-t border-line/60 pt-4'}`}>
          {actions}
          {askable && <span className="ml-3 text-[11px] text-ink-faint">{s.step === 'explain' ? '问完再出题' : '问完再提交'}</span>}
        </div>
      )}
    </div>
  );
}