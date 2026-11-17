// 轻量富文本：段落 + 列表 + ``` 代码块 + `行内代码`（讲解与笔记共用）。
// 排版契约：正文 15px/2.0 行高、限宽由外层给；代码块带标题栏，可选"写入代码区"。
function Inline({ text }) {
  return text.split(/(`[^`]+`)/).map((t, k) =>
    t.startsWith('`') ? (
      <code key={k} className="font-mono text-[13px] bg-paper-deep px-1.5 py-0.5 rounded text-cinnabar-deep">
        {t.slice(1, -1)}
      </code>
    ) : (
      t
    )
  );
}

const LIST_RE = /^\s*(?:[-*•]|\d+[.、)])\s+/;

export default function Rich({ text, onLoadCode = null, codeLabel = '示例' }) {
  const parts = (text || '').split(/```/);
  return (
    <div className="flex flex-col gap-5">
      {parts.map((seg, i) => {
        if (i % 2 === 1) {
          const code = seg.replace(/^\w*\n/, '').replace(/\n$/, '');
          return (
            <div key={i} className="rounded-xl overflow-hidden border border-line/80 shadow-sm">
              <div className="flex items-center gap-2 px-4 py-2 bg-paper-deep border-b border-line/70">
                <span className="text-[11px] tracking-widest text-ink-faint font-mono uppercase flex-1">
                  {codeLabel} · {code.split('\n').length} 行
                </span>
                {onLoadCode && (
                  <button
                    className="text-[11px] text-pine-deep hover:text-pine hover:underline"
                    onClick={() => onLoadCode(code)}
                  >
                    写入代码区 →
                  </button>
                )}
              </div>
              <pre className="bg-night text-paper/90 px-4 py-3 text-[13px] leading-6 font-mono overflow-x-auto whitespace-pre">
                {code}
              </pre>
            </div>
          );
        }
        // 文本段：按空行切块；块内把连续列表行合成列表，其余行合成段落
        // （模型常写"记住两件事：\n- …"，列表前不一定有空行）
        const blocks = seg.split(/\n{2,}/).filter((b) => b.trim());
        return blocks.map((block, j) => {
          const lines = block.split('\n').filter((l) => l.trim());
          const groups = [];
          for (const l of lines) {
            const isList = LIST_RE.test(l);
            const last = groups[groups.length - 1];
            if (last && last.list === isList) last.lines.push(l);
            else groups.push({ list: isList, lines: [l] });
          }
          return groups.map((g, k) =>
            g.list ? (
              <ul key={`${i}-${j}-${k}`} className="flex flex-col gap-2.5 pl-1">
                {g.lines.map((l, n) => (
                  <li key={n} className="flex gap-2.5 text-[15px] leading-8 text-ink">
                    <span className="shrink-0 mt-[13px] w-1.5 h-1.5 rounded-full bg-pine" />
                    <span className="min-w-0"><Inline text={l.replace(LIST_RE, '')} /></span>
                  </li>
                ))}
              </ul>
            ) : (
              <p key={`${i}-${j}-${k}`} className="text-[15px] leading-8 text-ink whitespace-pre-wrap">
                <Inline text={g.lines.join('\n')} />
              </p>
            )
          );
        });
      })}
    </div>
  );
}