import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1600,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.png', 'apple-touch-icon.png', 'og-image.png'],
      manifest: {
        name: 'Freli',
        short_name: 'Freli',
        description: 'Onboarding client simplifié par Freli',
        lang: 'fr',
        theme_color: '#5B6EF5',
        background_color: '#0D0F14',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/dashboard',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Avoid workbox terser crash on large chunks (pdf.worker) during SW generation.
        mode: 'development',
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        globIgnores: ['**/pdf.worker*.mjs'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
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
