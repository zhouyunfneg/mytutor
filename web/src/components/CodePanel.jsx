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

// 纸白主题：语法色只用全站色族（index.css）——墨色正文、陶土红关键字/数字、
// 灰绿字符串、淡墨注释；选区/光标借用品牌陶土红，不引入第四色相。
monaco.editor.defineTheme('mytutor-paper', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '7d7568', fontStyle: 'italic' },
    { token: 'keyword', foreground: '9d5f50', fontStyle: 'bold' },
    { token: 'string', foreground: '5c7a67' },
    { token: 'number', foreground: '9d5f50' },
    { token: 'type', foreground: '5c564e' },
    { token: 'delimiter', foreground: '7d7568' },
    { token: 'tag', foreground: '9d5f50', fontStyle: 'bold' },
    { token: 'metatag', foreground: '9d5f50', fontStyle: 'bold' },
    { token: 'attribute.name', foreground: '5c564e' },
    { token: 'attribute.value', foreground: '5c7a67' },
    { token: 'string.escape', foreground: '9d5f50' },
    { token: 'regexp', foreground: '5c7a67' },
    { token: 'constant', foreground: '9d5f50' },
    { token: 'function', foreground: '5c564e', fontStyle: 'bold' },
    { token: 'annotation', foreground: '7d7568' },
    { token: 'delimiter.html', foreground: '7d7568' },
    { token: 'delimiter.curly', foreground: '7d7568' },
    { token: 'delimiter.square', foreground: '7d7568' },
    { token: 'delimiter.round', foreground: '7d7568' },
    { token: 'delimiter.bracket', foreground: '7d7568' },
    { token: 'delimiter.parenthesis', foreground: '7d7568' },
    { token: 'delimiter.angle', foreground: '7d7568' },
    { token: 'attribute.value.number', foreground: '9d5f50' },
    { token: 'attribute.value.unit', foreground: '9d5f50' },
    { token: 'attribute.value.hex', foreground: '9d5f50' },
  ],
  colors: {
    'editor.background': '#fbf9f3',
    'editor.foreground': '#262219',
    'editorLineNumber.foreground': '#c9c2b4',
    'editorLineNumber.activeForeground': '#5c564e',
    'editor.selectionBackground': '#b3705f33',
    'editor.inactiveSelectionBackground': '#b3705f1f',
    'editor.lineHighlightBackground': '#f1eee6',
    'editorCursor.foreground': '#b3705f',
    'editorIndentGuide.background': '#d6cfc2',
    'editorWidget.background': '#fbf9f3',
    'editorWidget.border': '#d6cfc2',
    'editorSuggestWidget.background': '#fbf9f3',
    'editorSuggestWidget.border': '#d6cfc2',
    'editorSuggestWidget.selectedBackground': '#e8e4d8',
    'editorBracketHighlight.foreground1': '#7d7568',
    'editorBracketHighlight.foreground2': '#9d5f50',
    'editorBracketHighlight.foreground3': '#5c7a67',
    'editorBracketHighlight.unexpectedBracket.foreground': '#9d5f50',
  },
});

// 夜黑主题：暖炭面（night/night-soft），语法色为陶土红/灰绿的提亮档，
// 与纸白同一族色相，不用 monaco 默认 vs-dark 的蓝灰。
monaco.editor.defineTheme('mytutor-night', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '8a8177', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'd29a86', fontStyle: 'bold' },
    { token: 'string', foreground: '9dbba6' },
    { token: 'number', foreground: 'd29a86' },
    { token: 'type', foreground: 'c9c2b4' },
    { token: 'delimiter', foreground: '9a9287' },
    { token: 'tag', foreground: 'd29a86', fontStyle: 'bold' },
    { token: 'metatag', foreground: 'd29a86', fontStyle: 'bold' },
    { token: 'attribute.name', foreground: 'c9c2b4' },
    { token: 'attribute.value', foreground: '9dbba6' },
    { token: 'string.escape', foreground: 'd29a86' },
    { token: 'regexp', foreground: '9dbba6' },
    { token: 'constant', foreground: 'd29a86' },
    { token: 'function', foreground: 'c9c2b4', fontStyle: 'bold' },
    { token: 'annotation', foreground: '8a8177' },
    { token: 'delimiter.html', foreground: '9a9287' },
    { token: 'delimiter.curly', foreground: '9a9287' },
    { token: 'delimiter.square', foreground: '9a9287' },
    { token: 'delimiter.round', foreground: '9a9287' },
    { token: 'delimiter.bracket', foreground: '9a9287' },
    { token: 'delimiter.parenthesis', foreground: '9a9287' },
    { token: 'delimiter.angle', foreground: '9a9287' },
    { token: 'attribute.value.number', foreground: 'd29a86' },
    { token: 'attribute.value.unit', foreground: 'd29a86' },
    { token: 'attribute.value.hex', foreground: 'd29a86' },
  ],
  colors: {
    'editor.background': '#171310',
    'editor.foreground': '#e8e2d6',
    'editorLineNumber.foreground': '#6b6257',
    'editorLineNumber.activeForeground': '#c9c2b4',
    'editor.selectionBackground': '#b3705f4d',
    'editor.inactiveSelectionBackground': '#b3705f33',
    'editor.lineHighlightBackground': '#241e18',
    'editorCursor.foreground': '#d29a86',
    'editorIndentGuide.background': '#352c24',
    'editorWidget.background': '#241e18',
    'editorWidget.border': '#3a3128',
    'editorSuggestWidget.background': '#241e18',
    'editorSuggestWidget.border': '#3a3128',
    'editorSuggestWidget.selectedBackground': '#352c24',
    'editorBracketHighlight.foreground1': '#9a9287',
    'editorBracketHighlight.foreground2': '#d29a86',
    'editorBracketHighlight.foreground3': '#9dbba6',
    'editorBracketHighlight.unexpectedBracket.foreground': '#d29a86',
  },
});

const STARTERS = {
  python: '# 在这里写 Python，点「运行」看结果\nprint("你好，MyTutor")\n',
  javascript: '// 在这里写 JavaScript，点「运行」看结果\nconsole.log("你好，MyTutor");\n',
  typescript: '// 在这里写 TypeScript，点「运行」看结果\nconst greet = (name: string): string => `你好，${name}`;\nconsole.log(greet("MyTutor"));\n',
  html: '<!-- 写 HTML/CSS/JS，右侧实时预览 -->\n<style>\n  body { font-family: sans-serif; display: grid; place-items: center; height: 100vh; margin: 0; background: #f1eee6; }\n  h1 { color: #9d5f50; }\n</style>\n<h1>你好，MyTutor</h1>\n',
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
      <div className={`code-topbar flex flex-wrap items-center gap-1 gap-y-1 px-3 py-2 border-b ${
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
          className={`ml-auto shrink-0 px-2.5 py-1 rounded-md text-[11px] font-mono border transition-colors ${
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
          className="btn-seal shrink-0 whitespace-nowrap px-4 py-1 text-xs font-medium"
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
          theme={light ? 'mytutor-paper' : 'mytutor-night'}
          options={{
            fontSize: 13,
            fontFamily: 'Cascadia Code, JetBrains Mono, Consolas, monospace',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 12 },
            lineNumbersMinChars: 3,
            renderLineHighlight: 'gutter',
            bracketPairColorization: { enabled: false },
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