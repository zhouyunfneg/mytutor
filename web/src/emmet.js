// Emmet 缩写展开（与 VSCode 同一引擎 @vscode/emmet-helper）。
// 懒加载独立 chunk：进 HTML 页签才加载注册，其余语言不背这份体积。
// 两条路径：①补全列表给展开预览（Tab/Enter 接受）；②列表未开时 Tab 直接在光标处展开。
// 带 ${n} 停点的展开走 snippet 插入，Tab 可在停点间跳（VSCode 手感）；
// 无缩写时 Tab 保持原缩进；<script> 内不启用；<style> 内按 CSS 语法展开。
let installed = false;

const CONFIG = {
  showExpandedAbbreviation: 'always',
  showAbbreviationSuggestions: true,
  showSuggestionsAsSnippets: true,
  variables: { lang: 'zh-CN', charset: 'UTF-8' },
  preferences: {},
  syntaxProfiles: {},
};

const TRIGGERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ>+.()*^#[]{}$@-:!/=\'"'.split('');

export async function installEmmet(monaco) {
  if (installed) return;
  installed = true;
  const [helper, { TextDocument }] = await Promise.all([
    import('@vscode/emmet-helper'),
    import('vscode-languageserver-textdocument'),
  ]);

  const docOf = (model) =>
    TextDocument.create('file:///mytutor.html', 'html', model.getVersionId(), model.getValue());
  const lspPos = (p) => ({ line: p.lineNumber - 1, character: p.column - 1 });
  const monRange = (r) =>
    new monaco.Range(r.start.line + 1, r.start.character + 1, r.end.line + 1, r.end.character + 1);

  // 光标所在区域定 Emmet 语法：<style> 内 css、<script> 内禁用、其余 html
  const syntaxAt = (model, offset) => {
    const before = model.getValue().slice(0, offset);
    if (before.lastIndexOf('<script') > before.lastIndexOf('</script')) return null;
    if (before.lastIndexOf('<style') > before.lastIndexOf('</style')) return 'css';
    return 'html';
  };

  monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: TRIGGERS,
    provideCompletionItems(model, position) {
      const syntax = syntaxAt(model, model.getOffsetAt(position));
      if (!syntax) return { suggestions: [] };
      const pos = lspPos(position);
      const list = helper.doComplete(docOf(model), pos, syntax, CONFIG);
      if (!list || !list.items.length) return { suggestions: [] };
      const ex = helper.extractAbbreviation(docOf(model), pos, {
        lookAhead: true,
        type: syntax === 'css' ? 'stylesheet' : 'markup',
      });
      return {
        suggestions: list.items.map((it, i) => ({
          label: it.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: it.detail || 'Emmet',
          documentation: typeof it.documentation === 'string' ? it.documentation : it.documentation?.value || '',
          insertText: it.textEdit ? it.textEdit.newText : it.label,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: it.textEdit ? monRange(it.textEdit.range) : ex ? monRange(ex.abbreviationRange) : undefined,
          sortText: '0' + String(i).padStart(3, '0'),
          preselect: i === 0,
        })),
      };
    },
  });

  const attach = (editor) => {
    if (editor.__emmetTab) return;
    editor.__emmetTab = true;
    editor.onKeyDown((e) => {
      if (e.keyCode !== monaco.KeyCode.Tab || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const model = editor.getModel();
      if (!model || model.getLanguageId() !== 'html') return;
      // 补全列表开着时 Tab 走 monaco 默认接受补全（含 Emmet 预览项）
      if (document.querySelector('.suggest-widget.visible')) return;
      // snippet 停点模式里 Tab 归 monaco 跳停点，不抢
      if (document.querySelector('.monaco-editor .snippet-placeholder')) return;
      const pos = editor.getPosition();
      if (!pos) return;
      const syntax = syntaxAt(model, model.getOffsetAt(pos));
      if (!syntax) return;
      const ex = helper.extractAbbreviation(docOf(model), lspPos(pos), {
        lookAhead: false,
        type: syntax === 'css' ? 'stylesheet' : 'markup',
      });
      if (!ex || !ex.abbreviation) return;
      let expanded;
      try {
        expanded = helper.expandAbbreviation(ex.abbreviation, helper.getExpandOptions(syntax, CONFIG, ex.filter));
      } catch {
        return; // 非法缩写不拦 Tab，落回默认缩进
      }
      if (!expanded) return;
      e.preventDefault();
      e.stopPropagation();
      const range = monRange(ex.abbreviationRange);
      if (expanded.includes('${')) {
        // snippet 停点：monaco 无 insertSnippet 命令（那是 VSCode 侧），走贡献 API；
        // 先清缩写再在原地插 snippet，undo 由 opts 合为一步
        const ctrl = editor.getContribution('snippetController2');
        editor.executeEdits('emmet', [{ range, text: '', forceMoveMarkers: true }]);
        editor.setPosition(range.getStartPosition());
        if (ctrl && ctrl.insert) {
          ctrl.insert(expanded, { undoStopBefore: true, undoStopAfter: true });
        } else {
          editor.executeEdits('emmet', [{ range, text: expanded.replace(/\$\{\d+:?([^}]*)\}/g, '$1'), forceMoveMarkers: true }]);
        }
      } else {
        editor.executeEdits('emmet', [{ range, text: expanded, forceMoveMarkers: true }]);
        editor.setPosition(model.getPositionAt(model.getOffsetAt(range.getStartPosition()) + expanded.length));
      }
      editor.focus();
    });
  };
  monaco.editor.getEditors().forEach(attach);
  monaco.editor.onDidCreateEditor(attach);
}