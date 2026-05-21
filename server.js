import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import dns from 'node:dns/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(__dirname, 'dist')
const port = Number(process.env.PORT) || 10000
const absUpstream = process.env.ABS_UPSTREAM?.replace(/\/+$/, '')

const analyticsScript = process.env.ANALYTICS_SCRIPT?.trim()
if (analyticsScript) {
  const indexPath = path.join(dist, 'index.html')
  const html = fs.readFileSync(indexPath, 'utf-8')
  fs.writeFileSync(indexPath, html.replace('<!-- ANALYTICS -->', analyticsScript))
  console.log('Analytics script injected into index.html')
}

const PRIVATE_RANGES = [
  [0x7F000000, 0xFF000000], // 127.0.0.0/8
  [0x0A000000, 0xFF000000], // 10.0.0.0/8
  [0xAC100000, 0xFFF00000], // 172.16.0.0/12
  [0xC0A80000, 0xFFFF0000], // 192.168.0.0/16
  [0xA9FE0000, 0xFFFF0000], // 169.254.0.0/16
  [0x00000000, 0xFF000000], // 0.0.0.0/8
]

function ipToInt(ip) {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function isPrivateIp(ip) {
  if (ip.includes(':')) return true
  const n = ipToInt(ip)
  return PRIVATE_RANGES.some(([net, mask]) => (n & mask) === net)
}

async function validateTarget(urlStr) {
  let parsed
  try {
    parsed = new URL(urlStr)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null

  try {
    const { address } = await dns.lookup(parsed.hostname)
    if (isPrivateIp(address)) return null
  } catch {
    return null
  }
  return parsed
}

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
}

app.use('/proxy', async (req, res) => {
  const targetUrl = req.url.slice(1)
  const validated = await validateTarget(targetUrl)
  if (!validated) {
    res.status(403).json({ error: 'Blocked: only public HTTPS URLs are allowed' })
    return
  }

  const headers = { ...req.headers }
  delete headers.host
  delete headers.connection
  headers.host = validated.host

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
      duplex: 'half',
    })

    res.status(upstream.status)
    for (const [key, value] of upstream.headers) {
      if (['transfer-encoding', 'connection'].includes(key.toLowerCase())) continue
      res.setHeader(key, value)
    }
    if (upstream.body) {
      const reader = upstream.body.getReader()
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read()
          if (done) { res.end(); return }
          if (!res.write(value)) {
            await new Promise((resolve) => res.once('drain', resolve))
          }
        }
      }
      await pump()
    } else {
      res.end()
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Upstream request failed' })
    }
  }
})

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
  if (absUpstream) console.log(`Static proxy /abs/* → ${absUpstream}`)
  console.log('Dynamic proxy /proxy/* enabled')
})
