import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // GitHub Pages relative asset paths
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm', '@xenova/transformers'],
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1600,
  },
})
