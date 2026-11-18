// 浏览器 shim：@vscode/emmet-helper 的 ESM 从 Node 内置 'util' 引 TextDecoder/TextEncoder，
// 浏览器里这两个本就是全局（现代浏览器全有）。rollup 严校验内置模块导出会 build 失败，
// 故 vite alias 把 'util' 指到本文件补上全局引用；dev 态 esbuild 曾放行但同属隐患。
export const TextDecoder = globalThis.TextDecoder;
export const TextEncoder = globalThis.TextEncoder;
export default { TextDecoder, TextEncoder };