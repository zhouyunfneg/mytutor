import { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import { api } from '../api.js';

// 本地打包 Monaco，不走 CDN
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    if (label === 'html') return new htmlWorker();
    if (label === 'css') return new cssWorker();
    return new editorWorker();
  },
};
loader.config({ monaco });

// 纸白主题：与全站宣纸配色一致（index.css 的 paper/ink/cinnabar/pine）
monaco.editor.defineTheme('mytutor-paper', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '948b80', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c03a2b' },
    { token: 'string', foreground: '2f6d4f' },
    { token: 'number', foreground: 'b07420' },
    { token: 'type', foreground: '1f5f8b' },
    { token: 'delimiter', foreground: '57504a' },
  ],
  colors: {
    'editor.background': '#fdfaf4',
    'editor.foreground': '#211d19',
    'editorLineNumber.foreground': '#c4b8a2',
    'editorLineNumber.activeForeground': '#57504a',
    'editor.selectionBackground': '#e8ddc8',
    'editor.inactiveSelectionBackground': '#efe7d7',
    'editor.lineHighlightBackground': '#f7f2e9',
    'editorCursor.foreground': '#c03a2b',
    'editorIndentGuide.background': '#e5dcc8',
    'editorWidget.background': '#f7f2e9',
    'editorWidget.border': '#ddd2c0',
    'editorSuggestWidget.background': '#fdfaf4',
    'editorSuggestWidget.border': '#ddd2c0',
    'editorSuggestWidget.selectedBackground': '#efe7d7',
  },
});

const STARTERS = {
  python: '# 在这里写 Python，点「运行」看结果\nprint("你好，MyTutor")\n',
  javascript: '// 在这里写 JavaScript，点「运行」看结果\nconsole.log("你好，MyTutor");\n',
  typescript: '// 在这里写 TypeScript，点「运行」看结果\nconst greet = (name: string): string => `你好，${name}`;\nconsole.log(greet("MyTutor"));\n',
  html: '<!-- 写 HTML/CSS/JS，右侧实时预览 -->\n<style>\n  body { font-family: sans-serif; display: grid; place-items: center; height: 100vh; margin: 0; background: #f7f2e9; }\n  h1 { color: #c03a2b; }\n</style>\n<h1>你好，MyTutor</h1>\n',
};

const LANGS = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'html', label: 'HTML 预览' },
];

export default function CodePanel({ lockLang = null, onCodeChange, inject = null }) {
  const [lang, setLang] = useState('python');
  const [codes, setCodes] = useState(STARTERS);
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem('mytutor-code-theme') || 'paper');
  const debounceRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('mytutor-code-theme', theme);
  }, [theme]);

  const light = theme === 'paper';

  const code = codes[lang];
  const setCode = (v) => setCodes((c) => ({ ...c, [lang]: v ?? '' }));

  // 语言包锁定语言
  useEffect(() => {
    if (lockLang) setLang(lockLang);
  }, [lockLang]);

  // 外部注入代码（载入起始代码）
  useEffect(() => {
    if (!inject) return;
    setLang(inject.lang);
    setCodes((c) => ({ ...c, [inject.lang]: inject.code }));
  }, [inject]);

  // 向学习页同步当前代码（供提交判题）
  useEffect(() => {
    onCodeChange?.(lang, code);
  }, [lang, code]);

  // HTML 实时预览（防抖）
  useEffect(() => {
    if (lang !== 'html') return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setPreviewKey((k) => k + 1), 600);
    return () => clearTimeout(debounceRef.current);
  }, [code, lang]);

  const run = async () => {
    if (lang === 'html') {
      setPreviewKey((k) => k + 1);
      return;
    }
    setRunning(true);
    setOutput('运行中…');
    try {
      const r = await api.post('/api/run', { code, language: lang, timeout: 15 });
      setOutput(r.output || '(无输出)');
    } catch (e) {
      setOutput(`请求失败: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  const monacoLang = lang === 'javascript' ? 'javascript' : lang;
  const previewDoc = useMemo(() => codes.html, [codes.html, previewKey]);

  return (
    <div className={`code-shell flex flex-col h-full rounded-xl overflow-hidden border ${
      light ? 'bg-card border-line' : 'bg-night border-night-soft'
    }`}>
      {/* 顶栏 */}
      <div className={`code-topbar flex items-center gap-1 px-3 py-2 border-b ${
        light ? 'bg-paper-deep border-line' : 'bg-night-soft border-white/5'
      }`}>
        {(lockLang ? LANGS.filter((l) => l.id === lockLang) : LANGS).map((l) => (
          <button
            key={l.id}
            onClick={() => setLang(l.id)}
            className={`px-3 py-1 rounded-md text-xs font-mono transition-all ${
              lang === l.id
                ? light ? 'bg-ink text-paper' : 'bg-paper text-ink'
                : light ? 'text-ink-faint hover:text-ink' : 'text-paper/50 hover:text-paper/80'
            }`}
          >
            {l.label}
          </button>
        ))}
        <button
          onClick={() => setTheme(light ? 'night' : 'paper')}
          title="切换代码区主题"
          className={`ml-auto px-2.5 py-1 rounded-md text-[11px] font-mono border transition-colors ${
            light
              ? 'border-line text-ink-soft hover:text-ink hover:border-ink-faint'
              : 'border-white/15 text-paper/60 hover:text-paper'
          }`}
        >
          {light ? '夜黑' : '纸白'}
        </button>
        <button
          onClick={run}
          disabled={running}
          className="btn-seal px-4 py-1 text-xs font-medium"
        >
          {running ? '运行中…' : lang === 'html' ? '刷新预览' : '运行 ▶'}
        </button>
      </div>

      {/* 编辑器 */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={monacoLang}
          value={code}
          onChange={setCode}
          theme={light ? 'mytutor-paper' : 'vs-dark'}
          options={{
            fontSize: 13,
            fontFamily: 'Cascadia Code, JetBrains Mono, Consolas, monospace',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 12 },
            lineNumbersMinChars: 3,
            renderLineHighlight: 'gutter',
            automaticLayout: true,
            tabSize: 2,
          }}
        />
      </div>

      {/* 输出 / 预览 */}
      <div className={`h-[38%] shrink-0 border-t flex flex-col ${
        light ? 'border-line bg-paper' : 'border-white/10'
      }`}>
        <div className={`px-3 py-1.5 text-[10px] tracking-widest font-mono uppercase ${
          light ? 'text-ink-faint' : 'text-paper/40'
        }`}>
          {lang === 'html' ? 'Preview · 实时预览' : 'Console · 输出'}
        </div>
        {lang === 'html' ? (
          <iframe
            key={previewKey}
            title="preview"
            srcDoc={previewDoc}
            sandbox="allow-scripts"
            className="flex-1 w-full bg-white"
          />
        ) : (
          <pre className={`flex-1 overflow-auto px-3 pb-2 text-xs font-mono whitespace-pre-wrap ${
            light ? 'text-ink-soft' : 'text-paper/85'
          }`}>
            {output || '点「运行」执行代码'}
          </pre>
        )}
      </div>
    </div>
  );
}