// 示意图渲染：懒加载 mermaid（只有真的出现图示才拉取这份较大的依赖），
// 主题锁定全站柔和色族（index.css 同源），securityLevel strict 禁脚本/外链。
// 服务端只存 Mermaid 结构 spec，布局由 mermaid 的 dagre 引擎保证整齐。
let mermaidPromise = null;
let seq = 0;

function load() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        // 关键：parse/draw 失败时 mermaid 默认会把"Syntax error in text"错误图
        // 画进 body 的临时 div 并在清理前抛错 → 错误块永久留在页面底部。
        // 开启后失败只抛错、自行清理临时元素，配合下方兜底清扫保证零残留。
        suppressErrorRendering: true,
        theme: 'base',
        fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif',
        themeVariables: {
          fontSize: '14px',
          primaryColor: '#fbf9f3',
          primaryTextColor: '#262219',
          primaryBorderColor: '#d6cfc2',
          lineColor: '#9a9287',
          secondaryColor: '#e8e4d8',
          tertiaryColor: '#f1eee6',
          clusterBkg: '#f1eee6',
          clusterBorder: '#d6cfc2',
          edgeLabelBackground: '#fbf9f3',
          nodeBorder: '#d6cfc2',
          mainBkg: '#fbf9f3',
          textColor: '#262219',
        },
        flowchart: { curve: 'basis', padding: 12, nodeSpacing: 36, rankSpacing: 40, useMaxWidth: true },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

// 旧会话里存的手写 SVG 仍直出（向后兼容）；新会话存 Mermaid spec
export const isLegacySvg = (spec) => typeof spec === 'string' && spec.trim().startsWith('<svg');

export async function renderDiagram(spec) {
  const mermaid = await load();
  // 渲染 id 必须与页面任何容器 id 不同：mermaid 会建同 id 临时元素并在渲染后按 id 删除
  const id = `mmd-${++seq}`;
  try {
    // 先 parse 预检：语法不合格直接抛错走"整卡隐藏"降级，不进入 render 的错误图分支
    await mermaid.parse(spec);
    const { svg } = await mermaid.render(id, spec);
    return svg;
  } catch (e) {
    // 兜底清扫：mermaid 临时容器 id 为 "d" + 渲染 id（含错误图残留），只删自己的，不碰页面内容
    document.getElementById(`d${id}`)?.remove();
    throw e;
  }
}