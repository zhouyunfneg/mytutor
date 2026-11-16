// 轻量富文本：段落 + ``` 代码块 + `行内代码`（讲解与笔记共用）
export default function Rich({ text }) {
  const parts = (text || '').split(/```/);
  return (
    <div className="flex flex-col gap-3">
      {parts.map((seg, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            className="bg-night text-paper/90 rounded-lg px-3 py-2.5 text-xs font-mono overflow-x-auto whitespace-pre"
          >
            {seg.replace(/^\w*\n/, '')}
          </pre>
        ) : (
          seg
            .split(/\n{2,}/)
            .filter((p) => p.trim())
            .map((p, j) => (
              <p key={`${i}-${j}`} className="text-sm leading-relaxed text-ink-soft whitespace-pre-wrap">
                {p.split(/(`[^`]+`)/).map((t, k) =>
                  t.startsWith('`') ? (
                    <code key={k} className="font-mono text-[12px] bg-paper-deep px-1 py-0.5 rounded text-cinnabar">
                      {t.slice(1, -1)}
                    </code>
                  ) : (
                    t
                  )
                )}
              </p>
            ))
        )
      )}
    </div>
  );
}