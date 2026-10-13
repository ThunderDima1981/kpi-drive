import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '::',
    port: Number(process.env.WEB_PORT ?? 4317),
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.API_TARGET ?? 'http://127.0.0.1:4327',
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
})
