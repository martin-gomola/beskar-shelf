#!/usr/bin/env node
/**
 * Capture mobile screenshots of the running dev server for the README.
 *
 * Prerequisites:
 *   - `make dev` running on localhost:5173
 *   - ABS_URL and ABS_TOKEN set in .env
 *   - `npx playwright install chromium` (one-time)
 *
 * Usage:
 *   node scripts/screenshots.mjs
 */

import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT = resolve(ROOT, 'docs/screenshots')
const BASE = process.env.BASE_URL || 'http://localhost:5173'

function loadEnv() {
  const envPath = resolve(ROOT, '.env')
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  const env = {}
  for (const line of lines) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return env
}

async function absApi(absUrl, token, path) {
  const res = await fetch(`${absUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`)
  return res.json()
}

async function main() {
  const env = loadEnv()
  const absUrl = (env.ABS_URL || '').replace(/\/$/, '')
  const token = env.ABS_TOKEN
  const proxyBase = env.VITE_ABS_PROXY_BASE || '/abs'

  if (!absUrl || !token) {
    console.error('ABS_URL and ABS_TOKEN must be set in .env')
    process.exit(1)
  }

  console.log('Fetching user info from ABS...')
  const user = await absApi(absUrl, token, '/api/me')
  console.log(`Authenticated as ${user.username}`)

  // Find a library and items for player/reader screenshots
  const libraries = await absApi(absUrl, token, '/api/libraries')
  const lib = libraries.libraries?.[0]
  if (!lib) {
    console.error('No libraries found')
    process.exit(1)
  }

  const items = await absApi(absUrl, token, `/api/libraries/${lib.id}/items?limit=50&sort=media.metadata.title`)
  const allBooks = items.results || []
  const ebookItem = allBooks.find((b) => b.media?.ebookFile || b.media?.ebookFormat)

  // Find an item with listening progress for the player screenshot
  const sessions = await absApi(absUrl, token, '/api/me/listening-sessions?itemsPerPage=5')
  const recentSession = sessions.sessions?.[0]

  const serverConfig = JSON.stringify({ baseUrl: proxyBase, mode: 'proxy' })
  const sessionConfig = JSON.stringify({ token, user })

  // Seed playback state so the player page auto-resumes
  let playbackState = null
  if (recentSession) {
    playbackState = JSON.stringify({
      itemId: recentSession.libraryItemId,
      sessionId: recentSession.id,
      currentTime: recentSession.currentTime || 0,
      duration: recentSession.duration || 0,
      rate: recentSession.playbackRate || 1,
      updatedAt: Date.now(),
    })
  }

  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    isMobile: true,
    hasTouch: true,
  })

  const page = await context.newPage()

  // Inject auth into localStorage before the app loads
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate(({ server, session, playback }) => {
    localStorage.setItem('beskar:pwa:server', server)
    localStorage.setItem('beskar:pwa:session', session)
    if (playback) localStorage.setItem('beskar:pwa:playback', playback)
  }, { server: serverConfig, session: sessionConfig, playback: playbackState })

  async function hideMiniPlayer() {
    await page.evaluate(() => {
      document.querySelector('.mini-player')?.remove()
    })
    await page.waitForTimeout(200)
  }

  // --- Home ---
  console.log('Capturing Home...')
  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await hideMiniPlayer()
  await page.screenshot({ path: `${OUT}/home-preview.png`, fullPage: false })

  // --- Library ---
  console.log('Capturing Library...')
  await page.goto(`${BASE}/library/${lib.id}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await hideMiniPlayer()
  await page.screenshot({ path: `${OUT}/library-overview.png`, fullPage: false })

  // --- Player ---
  console.log('Capturing Player...')
  if (recentSession) {
    await page.goto(`${BASE}/player`, { waitUntil: 'domcontentloaded' })
    // Wait for the player UI to render (cover image or player controls)
    await page.waitForSelector('.player-cover, .player-controls', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2000)
    // Hide the mini-player bar so it doesn't overlap the bottom nav
    await page.evaluate(() => {
      document.querySelector('.mini-player')?.remove()
    })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/audio-player.png`, fullPage: false })
  } else {
    console.log('  No recent session; skipping player screenshot')
  }

  // --- Reader ---
  console.log('Capturing Reader...')
  if (ebookItem) {
    await page.goto(`${BASE}/read/${ebookItem.id}`, { waitUntil: 'domcontentloaded' })
    // Wait for the ebook content to render (not just "Opening book...")
    await page.waitForSelector('iframe, .reader-content, .epub-container', { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(5000)
    await page.screenshot({ path: `${OUT}/epub-reader.png`, fullPage: false })
  } else {
    console.log('  No ebook found in library; skipping reader screenshot')
  }

  await browser.close()
  console.log(`Done! Screenshots saved to ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
