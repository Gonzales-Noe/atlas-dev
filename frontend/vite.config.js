import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // Same-origin by default. Set VITE_ASSET_BASE to a CDN origin at build time
    // (for example https://cdn.atlas-ph.tech/) once that host serves /assets.
    base: env.VITE_ASSET_BASE || '/',
    plugins: [react()],
    build: {
      minify: 'esbuild',
      cssMinify: true,
      cssCodeSplit: true,
      sourcemap: false,
      reportCompressedSize: true,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('@mui') || id.includes('@emotion')) return 'mui'
            if (id.includes('recharts') || id.includes('d3-')) return 'charts'
            if (id.includes('pdfjs-dist') || id.includes('docx-preview')) return 'documents'
            if (id.includes('xlsx')) return 'xlsx'
            if (id.includes('react-dom') || id.includes('react-router') || /\/react\//.test(id)) return 'react'
            return undefined
          },
        },
      },
    },
    server: {
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
