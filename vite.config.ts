import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) return 'motion'
          if (id.includes('node_modules/react')) return 'react'
        },
      },
    },
  },
})
