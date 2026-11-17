import { useEffect, useRef, useState } from 'react';
import { isLegacySvg, renderDiagram } from '../diagram.js';

// 示意图卡片：Mermaid spec 懒加载渲染；旧手写 SVG 直出；渲染失败整卡隐藏（降级无图）。
export default function Diagram({ spec }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!spec || isLegacySvg(spec)) return undefined;
    let alive = true;
    setFailed(false);
    renderDiagram(spec)
      .then((svg) => { if (alive && ref.current) ref.current.innerHTML = svg; })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [spec]);

  if (!spec || failed) return null;

  return (
    <figure className="diagram rounded-xl border border-line/80 bg-card/70 px-4 pt-3 pb-4 shadow-sm">
      <figcaption className="text-[11px] tracking-widest text-ink-faint mb-2.5">
        示意图 · AI 绘制，帮助理解
      </figcaption>
      {isLegacySvg(spec) ? (
        <div dangerouslySetInnerHTML={{ __html: spec }} />
      ) : (
        <div ref={ref} className="flex justify-center [&_svg]:max-w-full [&_svg]:h-auto" />
      )}
    </figure>
  );
}