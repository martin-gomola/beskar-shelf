import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

function swVersionPlugin(): Plugin {
  return {
    name: 'sw-version',
    writeBundle(options) {
      const outDir = options.dir || 'dist'
      const swPath = path.resolve(outDir, 'sw.js')
      if (fs.existsSync(swPath)) {
        const content = fs.readFileSync(swPath, 'utf-8')
        fs.writeFileSync(swPath, content.replaceAll('__BUILD_VERSION__', Date.now().toString()))
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyBase = env.VITE_ABS_PROXY_BASE?.trim()
  const proxyTarget = env.ABS_URL?.trim() || env.VITE_ABS_PROXY_TARGET?.trim()

  return {
    plugins: [
      react(),
      swVersionPlugin(),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || '0.1.0'),
    },
    build: {
      target: 'es2020',
      minify: 'esbuild',
      cssMinify: true,
    },
    server: {
      headers: {
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
      },
      ...(proxyBase && proxyTarget
        ? {
            proxy: {
              [proxyBase]: {
                target: proxyTarget,
                changeOrigin: true,
                secure: true,
                rewrite: (p) => p.replace(new RegExp(`^${proxyBase}`), ''),
              },
            },
          }
        : {}),
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }
})
