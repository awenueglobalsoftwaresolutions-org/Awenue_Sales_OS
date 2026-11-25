import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // The biggest bundles (Excel export, PDF, charts) are loaded only when those screens open, so the first page stays small.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks cache well between deployments. Match exact package folders only.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (id.includes('@supabase')) return 'supabase'
          if (/[\\/]node_modules[\\/](react-hook-form|@hookform|zod)[\\/]/.test(id)) return 'forms'
          return undefined
        },
      },
    },
  },
})
