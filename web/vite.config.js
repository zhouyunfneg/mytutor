import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  // 生产挂 nginx 子路径 /tutor/（按自己的反代路径调整）；开发态保持根路径
  base: mode === 'production' ? '/tutor/' : '/',
  plugins: [react(), tailwindcss()],
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