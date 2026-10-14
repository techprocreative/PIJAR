import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Backend API lokal — dev server NestJS berjalan di :3001 (lihat apps/api/.env: PORT=3001)
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    proxy: {
      // REST API v1 (NestJS dengan prefix global /v1)
      '/v1': { target: API_TARGET, changeOrigin: true },
      // WS gateway Socket.IO (namespace /ws) — handshake bawa token di auth.token
      '/ws': { target: API_TARGET, ws: true, rewriteWsOrigin: true },
    },
  },
});
