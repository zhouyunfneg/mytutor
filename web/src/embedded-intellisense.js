// <style> 内真 CSS 补齐、<script> 内真 JS 补齐（属性名、属性值、成员、关键字）。
// 复用 monaco 已打包的两个引擎（css.worker / ts.worker），零新依赖、零新页签；
// 单文件工作流不变：实时预览、提交判题、起始代码都不动。
// 懒加载：进 HTML 页签才注册；引擎只在光标首次进入对应区域时才起 worker。
// 虚拟文档：css 用 plaintext（不触发 monaco 自带 cssMode，省一个重复 worker）；
// javascript 用真语言 id（monaco 的 JS 模式懒注册，必须这样才拿得到 worker）。
// 与 Emmet 并存：Emmet 管缩写展开（m10 → margin: 10px;），本模块管真提示，两者互不覆盖。
let installed = false;

// LSP CompletionItemKind → monaco 同名枚举
const CSS_KIND = {
  1: 'Text', 2: 'Method', 3: 'Function', 4: 'Constructor', 5: 'Field', 6: 'Variable',
  7: 'Class', 8: 'Interface', 9: 'Module', 10: 'Property', 11: 'Unit', 12: 'Value',
  13: 'Enum', 14: 'Keyword', 15: 'Snippet', 16: 'Color', 17: 'File', 18: 'Reference',
  19: 'Folder', 20: 'EnumMember', 21: 'Constant', 22: 'Struct', 23: 'Event',
  24: 'Operator', 25: 'TypeParameter',
};
// TypeScript ScriptElementKind → monaco 枚举（照 tsMode.js 的 convertKind 口径）
const JS_KIND = {
  keyword: 'Keyword', primitiveType: 'Keyword', variable: 'Variable', localVariable: 'Variable',
  memberVariable: 'Field', memberGetAccessor: 'Field', memberSetAccessor: 'Field',
  function: 'Function', memberFunction: 'Function', method: 'Function',
  constructSignature: 'Function', callSignature: 'Function', indexSignature: 'Function',
  enum: 'Enum', module: 'Module', class: 'Class', interface: 'Interface',
  const: 'Constant', let: 'Variable', var: 'Variable', type: 'Struct', alias: 'Reference',
};

const TRIGGERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:'.split('');

// 找出 <style>/<script> 的内容区间（偏移基于原文）。
// HTML 注释先抹成等长空格再扫描：注释里的标签不算区域，偏移却不变；
// 未闭合的块一直延伸到文末——正在输入、还没写 </style> 时也要能补齐。
// 已知边界：JS 字符串里若出现字面量 "</script>" 会提前截断（教学场景极罕见）。
function regionsOf(text) {
  const masked = text.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));
  const out = [];
  const open = /<(style|script)(?=[\s>])[^>]*>/gi;
  let m;
  while ((m = open.exec(masked))) {
    const tag = m[1].toLowerCase();
    const start = m.index + m[0].length;
    const close = new RegExp(`</${tag}(?=[\\s>])[^>]*>`, 'i').exec(masked.slice(start));
    const end = close ? start + close.index : masked.length;
    out.push({ kind: tag === 'style' ? 'css' : 'javascript', start, end });
    open.lastIndex = end;
  }
  return out;
}

export async function installEmbeddedIntellisense(monaco) {
  if (installed) return;
  installed = true;

  const uriOf = {
    css: monaco.Uri.parse('inmemory://mytutor/embedded.css'),
    javascript: monaco.Uri.parse('inmemory://mytutor/embedded.js'),
  };
  // 每种语言一个虚拟文档，复用不新建。
  // css 用 plaintext：worker 按 uri 取镜像文本、语言由 createData 决定（探针证实），
  // 这样不触发 monaco 自带 cssMode，省掉一个重复 worker。
  // javascript 必须用真语言 id：monaco 的 JS 模式是懒注册的（onLanguage 钩子），
  // 不建 javascript 模型则 getJavaScriptWorker() 直接 reject「JavaScript not registered!」（实测）。
  // 它与 JS 页签共用同一个 worker 管理器，不会多起一份。
  const virtualOf = (kind, text) => {
    let m = monaco.editor.getModel(uriOf[kind]);
    if (!m) m = monaco.editor.createModel(text, kind === 'css' ? 'plaintext' : 'javascript', uriOf[kind]);
    else if (m.getValue() !== text) m.setValue(text);
    return m;
  };

  let cssP = null;
  const cssWorker = () => {
    if (!cssP) {
      cssP = (async () => {
        const w = monaco.editor.createWebWorker({
          moduleId: 'vs/language/css/cssWorker',
          label: 'css',
          createData: { options: monaco.languages.css.cssDefaults.options, languageId: 'css' },
        });
        return { w, proxy: await w.getProxy() };
      })();
    }
    return cssP;
  };

  let jsP = null;
  const jsWorker = () => {
    if (!jsP) {
      jsP = (async () => {
        // monaco 的 JS 语言模式是懒注册的（onLanguage 异步生效）：刚建好虚拟 javascript
        // 模型时 getJavaScriptWorker() 仍会 reject「JavaScript not registered!」（实测），
        // 故轮询等它就绪（最多 ~2s）；失败不缓存，下次按键还能再试。
        for (let i = 0; i < 100; i++) {
          try {
            return await monaco.languages.typescript.getJavaScriptWorker();
          } catch {
            await new Promise((r) => setTimeout(r, 20));
          }
        }
        throw new Error('javascript worker not ready');
      })().catch((e) => { jsP = null; throw e; });
    }
    return jsP;
  };

  monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: TRIGGERS,
    async provideCompletionItems(model, position, context, token) {
      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      const region = regionsOf(text).find((r) => offset >= r.start && offset <= r.end);
      if (!region) return { suggestions: [] };

      const vm = virtualOf(region.kind, text.slice(region.start, region.end));
      const vOffset = offset - region.start;
      const word = model.getWordUntilPosition(position);
      const wordRange = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      // 虚拟文档偏移 → 原文范围（补全替换位置必须落回 HTML 模型）
      const rangeOf = (s, e) => {
        const p1 = model.getPositionAt(s + region.start);
        const p2 = model.getPositionAt(e + region.start);
        return new monaco.Range(p1.lineNumber, p1.column, p2.lineNumber, p2.column);
      };
      const lspRange = (r) => {
        const s = vm.getOffsetAt({ lineNumber: r.start.line + 1, column: r.start.character + 1 });
        const e = vm.getOffsetAt({ lineNumber: r.end.line + 1, column: r.end.character + 1 });
        return rangeOf(s, e);
      };
      const kindOf = (name) => monaco.languages.CompletionItemKind[name] ?? monaco.languages.CompletionItemKind.Property;
      const docOf = (d) => (typeof d === 'string' ? d : (d && d.value) || '');

      if (region.kind === 'css') {
        let css;
        try { css = await cssWorker(); } catch { return { suggestions: [] }; }
        const { w, proxy } = css;
        await w.withSyncedResources([vm.uri]);
        if (token.isCancellationRequested) return { suggestions: [] };
        const p = vm.getPositionAt(vOffset);
        const list = await proxy.doComplete(vm.uri.toString(), { line: p.lineNumber - 1, character: p.column - 1 });
        if (!list || token.isCancellationRequested) return { suggestions: [] };
        return {
          isIncomplete: list.isIncomplete,
          suggestions: list.items.map((it) => {
            const edit = it.textEdit;
            const item = {
              label: it.label,
              kind: kindOf(CSS_KIND[it.kind] || 'Property'),
              detail: it.detail || 'CSS',
              documentation: docOf(it.documentation),
              insertText: it.insertText || it.label,
              sortText: it.sortText,
              filterText: it.filterText,
              range: wordRange,
            };
            if (edit) {
              item.range = lspRange(edit.insert ? edit.insert : edit.range);
              item.insertText = edit.newText;
            }
            if (it.insertTextFormat === 2) item.insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
            // 补完属性名后自动再弹属性值（引擎给的命令）
            if (it.command) item.command = { id: it.command.command, title: it.command.title, arguments: it.command.arguments };
            return item;
          }),
        };
      }

      let getWorker;
      try { getWorker = await jsWorker(); } catch { return { suggestions: [] }; }
      const worker = await getWorker(vm.uri);
      if (token.isCancellationRequested) return { suggestions: [] };
      const info = await worker.getCompletionsAtPosition(vm.uri.toString(), vOffset);
      if (!info || token.isCancellationRequested) return { suggestions: [] };
      return {
        suggestions: info.entries.map((e) => ({
          label: e.name,
          kind: kindOf(JS_KIND[e.kind] || 'Property'),
          insertText: e.insertText || e.name,
          sortText: e.sortText,
          range: e.replacementSpan ? rangeOf(e.replacementSpan.start, e.replacementSpan.start + e.replacementSpan.length) : wordRange,
          // 详情按需取：monaco 只对选中项调 resolveCompletionItem
          __js: { uri: vm.uri.toString(), offset: vOffset, name: e.name },
        })),
      };
    },

    async resolveCompletionItem(item, token) {
      if (!item.__js) return item;
      try {
        const getWorker = await jsWorker();
        const worker = await getWorker(monaco.Uri.parse(item.__js.uri));
        const d = await worker.getCompletionEntryDetails(item.__js.uri, item.__js.offset, item.__js.name);
        if (!d || token.isCancellationRequested) return item;
        return {
          ...item,
          detail: (d.displayParts || []).map((x) => x.text).join('').slice(0, 200),
          documentation: (d.documentation || []).map((x) => x.text).join(''),
        };
      } catch {
        return item;
      }
    },
  });
}