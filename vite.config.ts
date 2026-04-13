import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyBase = env.VITE_ABS_PROXY_BASE?.trim()
  const proxyTarget = env.ABS_URL?.trim() || env.VITE_ABS_PROXY_TARGET?.trim()

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['pwa-icon.svg'],
        manifest: {
          name: 'Beskar Shelf',
          short_name: 'Beskar',
          description: 'Mobile-first Audiobookshelf playback PWA.',
          theme_color: '#08131b',
          background_color: '#08131b',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: '/pwa-icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png}'],
          runtimeCaching: [
            {
              urlPattern: /\/api\/items\/[^/]+\/cover/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'abs-covers',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 7 * 24 * 60 * 60,
                },
              },
            },
            {
              urlPattern: /\/api\/(libraries|me|items)/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'abs-api',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 5 * 60,
                },
              },
            },
          ],
        },
      }),
    ],
    server: proxyBase && proxyTarget
      ? {
          proxy: {
            [proxyBase]: {
              target: proxyTarget,
              changeOrigin: true,
              secure: true,
              rewrite: (path) => path.replace(new RegExp(`^${proxyBase}`), ''),
            },
          },
        }
      : undefined,
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }
})
