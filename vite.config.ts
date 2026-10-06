import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    include: ['pdfjs-dist/legacy/build/pdf.mjs'],
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'Holiday Planner',
        short_name: 'Holiday Planner',
        description: 'A family trip companion app for holiday bookings, itineraries, and documents.',
        theme_color: '#0f766e',
        background_color: '#fdf8f3',
        display: 'standalone',
        start_url: '/',
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
            src: '/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // mjs: the pdf.js worker is an .mjs file, so without it the PDF viewer
        // needs a connection even when the page itself loads offline.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // Trip documents and photos. The app downloads the current trip's
            // files into this cache (src/lib/offlineFiles.ts); this rule only
            // serves them, and statuses: [] stops it caching anything else.
            urlPattern: ({ url }: { url: URL }) =>
              url.pathname.includes('/storage/v1/object/public/documents/') && !url.searchParams.has('download'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'trip-files-v1',
              cacheableResponse: { statuses: [] },
            },
          },
        ],
      },
    }),
  ],
})
