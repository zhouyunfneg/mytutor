import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  // 生产挂 nginx 子路径 /tutor/（按自己的反代路径调整）；开发态保持根路径
  base: mode === 'production' ? '/tutor/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    // emmet-helper 引 Node 'util' 的 TextDecoder/TextEncoder → 浏览器全局 shim
    alias: { util: fileURLToPath(new URL('./src/util-browser-shim.js', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8300',
    },
  },
  build: {
    chunkSizeWarningLimit: 4000,
  },
}));