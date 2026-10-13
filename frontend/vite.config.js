import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Redirige /api vers le backend Next.js en développement
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})