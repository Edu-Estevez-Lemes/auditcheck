import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true,   // habilita proxy de WebSocket en /api/v1/scan/ws/...
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
