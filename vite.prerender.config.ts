import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Config minimale pour le build SSR du prerender (pas de PWA ni service worker). */
export default defineConfig({
  plugins: [react()],
  build: {
    ssr: 'src/entry-prerender.tsx',
    outDir: 'dist-ssr',
    emptyOutDir: true,
  },
})
