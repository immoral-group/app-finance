import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  envDir: '../',
  plugins: [react()],
  server: {
    proxy: {
      '/api/admin': {
        target: 'http://localhost:3010',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/admin/, '')
      },
      '/api/billing': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/billing/, '')
      },
      '/api/payroll': {
        target: 'http://localhost:3011',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/payroll/, '')
      },
      '/api/commissions': {
        target: 'http://localhost:3012',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/commissions/, '')
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
