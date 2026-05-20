import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(__dirname, 'dist')
const port = Number(process.env.PORT) || 10000
const absUpstream = process.env.ABS_UPSTREAM?.replace(/\/+$/, '')

const app = express()

app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  next()
})

if (absUpstream) {
  app.use(
    '/abs',
    createProxyMiddleware({
      target: absUpstream,
      changeOrigin: true,
      pathRewrite: { '^/abs': '' },
      ws: true,
      on: {
        proxyReq(proxyReq) {
          const url = new URL(absUpstream)
          proxyReq.setHeader('Host', url.host)
        },
      },
    }),
  )
} else {
  console.warn('ABS_UPSTREAM not set — proxy disabled, API calls will fail')
}

app.use(
  '/assets',
  express.static(path.join(dist, 'assets'), {
    maxAge: '1y',
    immutable: true,
  }),
)

app.use(express.static(dist, { index: false }))

app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    res.sendFile(path.join(dist, 'index.html'))
  } else {
    next()
  }
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Beskar Shelf listening on :${port}`)
  if (absUpstream) console.log(`Proxying /abs/* → ${absUpstream}`)
})
