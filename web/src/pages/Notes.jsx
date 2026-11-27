import { useEffect, useMemo, useState } from 'react';
import Rich from '../components/Rich.jsx';
import { api } from '../api.js';
import { StudyTimerBadge, useStudyTimer } from '../StudyTimer.jsx';

const SUB_LABEL = { point: '知识点', section: '小节总结', module: '模块总结' };

const fmtDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function NoteEditor({ initial, packs, onSave, onCancel, busy, onPackChange }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [content, setContent] = useState(initial?.content || '');
  const [packId, setPackId] = useState(initial?.pack_id || '');
  return (
    <div className="paper-card p-4 fade-up">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="field flex-1 min-w-40 text-sm font-medium"
          placeholder="笔记标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <select className="field text-xs w-36" value={packId} onChange={(e) => { setPackId(e.target.value); onPackChange(e.target.value); }}>
          <option value="">不关联语言</option>
          {packs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <textarea
        className="field w-full text-sm font-mono leading-relaxed resize-y"
        rows={8}
        placeholder="写点什么…支持 `行内代码` 和 ``` 代码块"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex items-center gap-2 mt-3">
        <button
          className="btn-seal px-5 py-1.5 text-xs"
          disabled={busy || !title.trim() || !content.trim()}
          onClick={() => onSave({ title: title.trim(), content: content.trim(), pack_id: packId || null })}
        >
          {busy ? '保存中…' : '保存'}
        </button>
        <button className="btn-ghost px-4 py-1.5 text-xs" onClick={onCancel}>取消</button>
        <span className="text-[11px] text-ink-faint ml-auto">AI 自动笔记也可以编辑补充</span>
      </div>
    </div>
  );
}

export default function Notes() {
  const [notes, setNotes] = useState(null);
  const [packs, setPacks] = useState([]);
  const [fPack, setFPack] = useState('');
  const [fKind, setFKind] = useState('');
  const [q, setQ] = useState('');
  const [editor, setEditor] = useState(null); // null | {id?} 新建或编辑
  const [editorPack, setEditorPack] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const { reportContext } = useStudyTimer();

  useEffect(() => {
    const packId = editor ? editorPack : fPack;
    reportContext({ kind: 'notes', pack_id: packId, pack_name: packs.find((p) => p.id === packId)?.name || packId });
    return () => reportContext(null);
  }, [fPack, packs, editor, editorPack, reportContext]);

  const load = async () => {
    try {
      setNotes(await api.get('/api/notes'));
    } catch (e) {
      setErr(String(e.message || e));
    }
  };
  useEffect(() => {
    load();
    api.get('/api/packs').then(setPacks).catch(() => {});
  }, []);

  const packName = (id) => packs.find((p) => p.id === id)?.name || id;

  const shown = useMemo(() => {
    if (!notes) return [];
    const ql = q.trim().toLowerCase();
    return notes.filter((n) =>
      (!fPack || n.pack_id === fPack) &&
      (!fKind || n.kind === fKind) &&
      (!ql || (n.title + '\n' + n.content).toLowerCase().includes(ql)));
  }, [notes, fPack, fKind, q]);

  const save = async (body) => {
    setBusy(true);
    setErr(null);
    try {
      const r = editor?.id
        ? await api.put(`/api/notes/${editor.id}`, body)
        : await api.post('/api/notes', body);
      if (r && r.ok === false) setErr(r.error);
      else setEditor(null);
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (n) => {
    if (!window.confirm(`删除笔记「${n.title}」？`)) return;
    try {
      await api.del(`/api/notes/${n.id}`);
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  const autoCount = notes?.filter((n) => n.kind === 'auto').length || 0;
  const manualCount = notes?.filter((n) => n.kind === 'manual').length || 0;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        <div className="flex items-start gap-3 fade-up">
          <div className="seal w-11 h-11 shrink-0 flex items-center justify-center text-xl font-bold">笔</div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-bold">笔记</h1>
            <p className="text-xs text-ink-faint mt-0.5">
              每学完一个点、每个小节/模块总结，AI 自动归纳成复习笔记（含你的卡壳错因）；也可以自己补充。
              {notes && ` 共 ${notes.length} 则 · AI ${autoCount} · 手写 ${manualCount}`}
            </p>
          </div>
          <button className="btn-seal px-4 py-2 text-sm shrink-0" onClick={() => { setEditorPack(''); setEditor({}); }}>
            记笔记
          </button>
        </div>

        {editor && (
          <NoteEditor
            initial={editor.id ? notes.find((n) => n.id === editor.id) : null}
            packs={packs}
            busy={busy}
            onSave={save}
            onCancel={() => setEditor(null)}
            onPackChange={setEditorPack}
          />
        )}

        <div className="flex items-center gap-2 flex-wrap fade-up" style={{ animationDelay: '0.05s' }}>
          <select className="field text-xs w-36" value={fPack} onChange={(e) => setFPack(e.target.value)}>
            <option value="">全部语言</option>
            {packs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="field text-xs w-32" value={fKind} onChange={(e) => setFKind(e.target.value)}>
            <option value="">全部来源</option>
            <option value="auto">AI 自动</option>
            <option value="manual">我写的</option>
          </select>
          <input
            className="field flex-1 min-w-40 text-xs"
            placeholder="搜索标题或内容…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <StudyTimerBadge />
        </div>

        {err && (
          <div className="text-xs text-cinnabar bg-cinnabar/5 border border-cinnabar/30 rounded-lg px-3 py-2">{err}</div>
        )}

        {!notes ? (
          <div className="text-xs text-ink-faint">加载中…</div>
        ) : shown.length === 0 ? (
          <div className="paper-card p-8 text-center fade-up">
            <p className="text-sm text-ink-soft mb-2">
              {notes.length === 0 ? '还没有笔记' : '没有匹配的笔记'}
            </p>
            <p className="text-xs text-ink-faint leading-relaxed">
              {notes.length === 0
                ? '去「学习」页学一个知识点，通过后 AI 会自动记下第一则笔记；或者点右上「记笔记」自己写。'
                : '换个筛选条件或关键词试试。'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 stagger">
            {shown.map((n) => (
              <div key={n.id} className="paper-card p-4">
                <div className="flex items-baseline gap-2 flex-wrap mb-2">
                  <h3 className="font-display text-base font-bold flex-1 min-w-0">{n.title}</h3>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
                    n.kind === 'auto' ? 'border-pine/40 text-pine bg-pine/5' : 'border-cinnabar/40 text-cinnabar bg-cinnabar/5'
                  }`}>
                    {n.kind === 'auto' ? 'AI 自动' : '我写的'}
                  </span>
                  {n.sub && <span className="text-[10px] text-ink-faint shrink-0">{SUB_LABEL[n.sub] || n.sub}</span>}
                  {n.pack_id && <span className="text-[10px] font-mono text-ink-faint shrink-0">{packName(n.pack_id)}</span>}
                  <span className="text-[10px] font-mono text-ink-faint shrink-0 ml-auto">{fmtDate(n.updated_at || n.created_at)}</span>
                </div>
                <Rich text={n.content} />
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-line/60">
                  <button className="btn-ghost px-3 py-1 text-[11px]" onClick={() => { setEditorPack(n.pack_id || ''); setEditor({ id: n.id }); }}>编辑</button>
                  <button className="btn-ghost px-3 py-1 text-[11px] hover:!text-cinnabar" onClick={() => remove(n)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}