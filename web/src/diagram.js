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
  const { svg } = await mermaid.render(`mmd-${++seq}`, spec);
  return svg;
}