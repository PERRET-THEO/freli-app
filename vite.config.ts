import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('@tanstack/react-table')) return 'react-table'
          if (id.includes('/motion/') || id.includes('\\motion\\')) return 'motion'
          if (id.includes('pdfjs-dist') || id.includes('pdf-lib')) return 'pdf'
          if (id.includes('signature_pad')) return 'signature'
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // autoUpdate + skipWaiting/clientsClaim: new SW activates immediately after deploy.
      // PwaUpdateBridge still shows a reload toast if a waiting worker needs a nudge.
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'favicon.png', 'apple-touch-icon.png', 'og-image.png'],
      manifest: {
        name: 'Freli',
        short_name: 'Freli',
        description: 'Onboarding client simplifié par Freli',
        lang: 'fr',
        theme_color: '#5B6EF5',
        background_color: '#0D0F14',
        display: 'standalone',
        start_url: '/dashboard',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Avoid workbox terser crash on large chunks (pdf.worker) during SW generation.
        mode: 'development',
        // Never precache index.html — stale HTML was serving the old wizard after deploys.
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        globIgnores: ['**/pdf.worker*.mjs', '**/index.html'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: true,
        navigationPreload: true,
        // Disable default CacheFirst navigateFallback → index.html (caused stale wizard after deploy).
        navigateFallback: null,
        // SPA shell: fetch latest HTML (dashboard + /p/:token), fall back to cache offline.
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-network-first',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 32,
                maxAgeSeconds: 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 300,
              },
            },
          },
        ],
      },
    }),
  ],
})
