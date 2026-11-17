import { useEffect, useState } from 'react';
import { api } from '../api.js';

const TEACH_MODELS = ['deepseek-chat', 'qwen-plus', 'qwen-max', 'qwen-flash'];
const REASON_MODELS = ['deepseek-reasoner', 'qwen-plus', 'qwen-max'];
const TASK_MODELS = ['qwen-flash', 'deepseek-chat', 'qwen-plus'];
const EMBED_MODELS = ['text-embedding-v4', 'text-embedding-v3'];

function TestResult({ r }) {
  if (!r) return null;
  if (r.ok) {
    return (
      <span className="text-xs text-pine">
        ✓ 连通 {r.latency_s}s
        {r.reply ? ` · 回复「${r.reply}」` : ''}
        {r.dim ? ` · ${r.dim} 维` : ''}
      </span>
    );
  }
  return <span className="text-xs text-cinnabar break-all">✗ {r.error}</span>;
}

function ProviderCard({ title, subtitle, provider, settings, onSaved }) {
  const p = settings.providers[provider];
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(p.base_url);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [embResult, setEmbResult] = useState(null);

  useEffect(() => setBaseUrl(p.base_url), [p.base_url]);

  const save = async () => {
    const patch = { providers: { [provider]: { base_url: baseUrl } } };
    if (key.trim()) patch.providers[provider].api_key = key.trim();
    await api.put('/api/settings', { patch });
    setKey('');
    setResult(null);
    onSaved();
  };

  const test = async (kind) => {
    setTesting(true);
    try {
      const r = await api.post(`/api/settings/test/${kind === 'embed' ? 'embedding' : provider}`);
      kind === 'embed' ? setEmbResult(r) : setResult(r);
    } catch (e) {
      const r = { ok: false, error: e.message };
      kind === 'embed' ? setEmbResult(r) : setResult(r);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="paper-card p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-display text-base font-bold">{title}</h3>
        <span className={`text-[11px] ${p.configured ? 'text-pine' : 'text-ink-faint'}`}>
          {p.configured ? `已配置 ${p.api_key_masked}` : '未配置'}
        </span>
      </div>
      <p className="text-xs text-ink-faint mb-4">{subtitle}</p>

      <label className="block text-xs text-ink-soft mb-1">API Key（留空则不修改）</label>
      <input
        type="password"
        className="field w-full mb-3 font-mono"
        placeholder={p.configured ? p.api_key_masked : '粘贴你的 key'}
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <label className="block text-xs text-ink-soft mb-1">接口地址</label>
      <input
        className="field w-full mb-4 font-mono text-xs"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={save} className="btn-ink px-4 py-1.5 text-xs">保存</button>
        <button onClick={() => test('chat')} disabled={testing || !p.configured} className="btn-ghost px-3 py-1.5 text-xs">
          测对话
        </button>
        {provider === 'dashscope' && (
          <button onClick={() => test('embed')} disabled={testing || !p.configured} className="btn-ghost px-3 py-1.5 text-xs">
            测嵌入
          </button>
        )}
        <TestResult r={result} />
        <TestResult r={embResult} />
      </div>
      {!p.configured && (
        <p className="text-[11px] text-ink-faint mt-3">先保存 key 才能测试连通。</p>
      )}
    </div>
  );
}

function AccountCard({ flash }) {
  const [old, setOld] = useState('');
  const [nw, setNw] = useState('');
  const [busy, setBusy] = useState(false);
  const change = async () => {
    setBusy(true);
    try {
      const r = await api.put('/api/password', { old, new: nw });
      if (r.ok) {
        setOld('');
        setNw('');
        flash('口令已改，下次登录用新口令');
      } else flash(r.error);
    } catch (e) {
      flash(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    await api.post('/api/logout');
    window.dispatchEvent(new Event('mytutor:unauthorized'));
  };
  return (
    <div className="paper-card p-5 mt-4 mb-8 fade-up">
      <h3 className="font-display text-base font-bold mb-4">账号</h3>
      <div className="flex flex-wrap items-center gap-2">
        <input type="password" className="field w-36 text-xs" placeholder="旧口令" value={old} onChange={(e) => setOld(e.target.value)} />
        <input type="password" className="field w-36 text-xs" placeholder="新口令（≥8位）" value={nw} onChange={(e) => setNw(e.target.value)} />
        <button className="btn-ink px-4 py-1.5 text-xs" disabled={busy || !old || !nw} onClick={change}>改口令</button>
        <button className="btn-ghost px-4 py-1.5 text-xs ml-auto" onClick={logout}>退出登录</button>
      </div>
      <p className="text-[11px] text-ink-faint mt-3">口令哈希存服务器本地；会话 7 天有效。</p>
    </div>
  );
}

function DocsCard() {
  const [open, setOpen] = useState(false);
  const [packs, setPacks] = useState([]);
  const [packId, setPackId] = useState('python');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && packs.length === 0) {
      api.get('/api/packs').then((list) => {
        setPacks(list);
        const ready = list.find((p) => p.status === 'ready');
        if (ready) setPackId(ready.id);
      }).catch(() => {});
    }
  }, [open]);

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await api.post(`/api/packs/${packId}/search`, { query: query.trim(), top_k: 4 }));
    } catch (e) {
      setResult({ ok: false, error: String(e.message || e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="paper-card p-5 mt-4 fade-up">
      <button className="w-full flex items-center gap-2 text-left" onClick={() => setOpen(!open)}>
        <h3 className="font-display text-base font-bold flex-1">官方资料库</h3>
        <span className="text-[11px] text-ink-faint">学习时自动引用，一般不用手动查</span>
        <span className={`text-ink-faint text-[10px] transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
      </button>
      {open && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2 mb-4">
            {packs.map((p) => (
              <span key={p.id} className="text-[11px] border border-line rounded px-2 py-1 bg-card/50">
                <span className="font-mono">{p.name}</span>
                <span className="text-ink-faint ml-1.5">
                  {p.status === 'ready' ? `${p.doc_count} 篇已索引` : '未就绪'}
                </span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select className="field text-xs w-36" value={packId} onChange={(e) => setPackId(e.target.value)}>
              {packs.filter((p) => p.status === 'ready').map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input
              className="field flex-1 min-w-40 text-xs"
              placeholder="想查什么，如：列表推导式"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
            />
            <button className="btn-ink px-4 py-1.5 text-xs" disabled={busy || !query.trim()} onClick={search}>
              {busy ? '检索中…' : '检索'}
            </button>
          </div>
          {result && (
            result.ok === false ? (
              <p className="text-xs text-cinnabar mt-3">{result.error}</p>
            ) : (
              <div className="mt-3 border border-line rounded-lg bg-paper-deep/40 p-3">
                <p className="text-xs leading-relaxed text-ink-soft whitespace-pre-wrap">{result.content}</p>
                {(result.sources || []).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-line/60">
                    {result.sources.map((s, i) => (
                      s.url ? (
                        <a key={i} href={s.url} target="_blank" rel="noreferrer"
                           className="text-[11px] text-pine hover:underline">
                          {s.title || s.url}
                        </a>
                      ) : (
                        <span key={i} className="text-[11px] text-ink-faint">{s.title}</span>
                      )
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function Me() {
  const [settings, setSettings] = useState(null);
  const [toast, setToast] = useState('');

  const load = async () => setSettings(await api.get('/api/settings'));
  useEffect(() => { load(); }, []);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  const patchModels = async (field, value) => {
    await api.put('/api/settings', { patch: { models: { [field]: value } } });
    load();
    flash('已保存');
  };

  const patchTeach = async (field, value) => {
    await api.put('/api/settings', { patch: { teach: { [field]: value } } });
    load();
    flash('已保存');
  };

  if (!settings) {
    return <div className="h-full grid place-items-center text-ink-faint text-sm">加载中…</div>;
  }

  const s = settings;
  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-display text-2xl font-bold mb-1 fade-up">我的 · 设置</h1>
        <p className="text-sm text-ink-faint mb-6 fade-up">密钥只存在服务器本地，不会发给模型，也不会进代码仓库。</p>

        <div className="grid gap-4 md:grid-cols-2 stagger">
          <ProviderCard
            title="DeepSeek"
            subtitle="主教学 / 深度推理 · platform.deepseek.com 获取 key"
            provider="deepseek"
            settings={s}
            onSaved={() => { load(); flash('已保存'); }}
          />
          <ProviderCard
            title="阿里百炼 DashScope"
            subtitle="Qwen 模型 + 知识库嵌入（必需）· bailian.console.aliyun.com 获取 key"
            provider="dashscope"
            settings={s}
            onSaved={() => { load(); flash('已保存'); }}
          />
        </div>

        <div className="paper-card p-5 mt-4 fade-up">
          <h3 className="font-display text-base font-bold mb-4">模型分工</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['teach', '主教学模型', '讲解、出题、纠错对话', TEACH_MODELS],
              ['reason', '深度推理', '生成技能树、判题复核等后台重活', REASON_MODELS],
              ['task', '小任务', '命名、摘要等轻活', TASK_MODELS],
              ['embed', '嵌入', '知识库检索必需（仅 DashScope）', EMBED_MODELS],
            ].map(([field, label, desc, options]) => (
              <div key={field}>
                <label className="block text-xs text-ink-soft mb-1">
                  {label} <span className="text-ink-faint">· {desc}</span>
                </label>
                <select
                  className="field w-full font-mono text-xs"
                  value={s.models[field]}
                  onChange={(e) => patchModels(field, e.target.value)}
                >
                  {options.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="paper-card p-5 mt-4 mb-8 fade-up">
          <h3 className="font-display text-base font-bold mb-4">教学偏好</h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <span className="text-xs text-ink-soft w-24 shrink-0">纠错风格</span>
              {[
                ['guide', '先引导后答案（推荐）'],
                ['direct', '直接讲清楚 + 给示例'],
              ].map(([v, label]) => (
                <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="style"
                    checked={s.teach.style === v}
                    onChange={() => patchTeach('style', v)}
                    className="accent-[var(--color-cinnabar)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DocsCard />
        <AccountCard flash={flash} />
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 btn-ink px-5 py-2 text-sm shadow-lg fade-up">
          {toast}
        </div>
      )}
    </div>
  );
}