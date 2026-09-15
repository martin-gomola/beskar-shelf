import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function requireCondition(condition, message) {
  if (!condition) failures.push(message)
}

function requireFile(relativePath) {
  const absolutePath = path.join(root, relativePath)
  requireCondition(fs.existsSync(absolutePath), `missing ${relativePath}`)
  return absolutePath
}

function requirePngSize(relativePath, expected) {
  const buffer = fs.readFileSync(requireFile(relativePath))
  requireCondition(buffer.subarray(1, 4).toString('ascii') === 'PNG', `${relativePath} is not a PNG`)
  requireCondition(
    buffer.readUInt32BE(16) === expected && buffer.readUInt32BE(20) === expected,
    `${relativePath} must be ${expected}x${expected}`,
  )
}

function requireOpaquePng(relativePath) {
  const buffer = fs.readFileSync(requireFile(relativePath))
  const colorType = buffer[25]
  const hasTransparencyChunk = buffer.includes(Buffer.from('tRNS', 'ascii'))
  requireCondition(
    (colorType === 0 || colorType === 2) && !hasTransparencyChunk,
    `${relativePath} must have an opaque background for launcher compatibility`,
  )
}

const crawlerDirectives = 'noindex, nofollow, noarchive, nosnippet, noimageindex'
const manifest = JSON.parse(read('public/manifest.webmanifest'))
const packageJson = JSON.parse(read('package.json'))
const packageLock = JSON.parse(read('package-lock.json'))
const indexHtml = read('index.html')
const sourceWorker = read('public/sw.js')
const mainSource = read('src/main.tsx')
const lifecycleSource = read('src/platform/updateLifecycle.ts')
const updateHookSource = read('src/hooks/useServiceWorkerUpdate.ts')
const shellSource = read('src/components/Shell.tsx')
const pullSource = read('src/components/PullToRefresh.tsx')
const viteSource = read('vite.config.ts')
const serverSource = read('server.js')
const nginxSource = read('nginx.conf')
const nginxSecuritySource = read('nginx-security-headers.conf')
const robotsSource = read('public/robots.txt')

for (const field of ['name', 'short_name', 'id', 'start_url', 'scope', 'display']) {
  requireCondition(Boolean(manifest[field]), `manifest is missing ${field}`)
}
requireCondition(manifest.display === 'standalone', 'manifest display must remain standalone')
requireCondition(manifest.id === '/', 'manifest id must remain stable at /')
requireCondition(manifest.theme_color === '#f3ede3', 'manifest theme color must match the light canvas')
requireCondition(manifest.background_color === manifest.theme_color, 'manifest background and theme colors must match')
requireCondition(/^\d+\.\d+\.\d+$/.test(packageJson.version), 'package version must use SemVer')
requireCondition(packageLock.version === packageJson.version, 'package-lock version must match package.json')
requireCondition(packageLock.packages?.['']?.version === packageJson.version, 'root lockfile package version must match package.json')
requireCondition(
  viteSource.includes('process.env.APP_VERSION || packageVersion'),
  'Vite app version must default to package.json',
)

const iconAtSize = (size, purpose = 'any') => manifest.icons?.some((icon) =>
  icon.sizes === `${size}x${size}` && (icon.purpose ?? 'any').split(' ').includes(purpose)
)
requireCondition(iconAtSize(192), 'manifest needs a 192x192 icon')
requireCondition(iconAtSize(512), 'manifest needs a 512x512 icon')
requireCondition(iconAtSize(512, 'maskable'), 'manifest needs a 512x512 maskable icon')
requirePngSize('public/icon-192.png', 192)
requirePngSize('public/icon-512.png', 512)
requirePngSize('public/icon-maskable-512.png', 512)
requirePngSize('public/apple-touch-icon.png', 180)
for (const icon of ['public/icon-192.png', 'public/icon-512.png', 'public/icon-maskable-512.png', 'public/apple-touch-icon.png']) {
  requireOpaquePng(icon)
}

requireCondition(indexHtml.includes('rel="apple-touch-icon" sizes="180x180"'), 'HTML needs the Apple touch icon')
requireCondition(indexHtml.includes('name="theme-color" content="#f3ede3"'), 'HTML light theme color is missing')
requireCondition(indexHtml.includes('name="theme-color" content="#050a10"'), 'HTML dark theme color is missing')
requireCondition(
  indexHtml.includes(`name="robots" content="${crawlerDirectives}, nocache"`),
  'HTML crawler policy is missing',
)
requireCondition(robotsSource.trim() === 'User-agent: *\nDisallow: /', 'robots.txt must deny crawlers')
for (const source of [viteSource, serverSource, nginxSecuritySource]) {
  requireCondition(source.includes(crawlerDirectives), 'deployment edge crawler policy is incomplete')
}
requireCondition(viteSource.includes('preview: {'), 'Vite preview must emit security headers')
requireCondition(
  (nginxSource.match(/include \/etc\/nginx\/security-headers\.conf;/g) ?? []).length === 7,
  'every Nginx location with local headers must include the shared security headers',
)

const installHandler = sourceWorker.match(/self\.addEventListener\('install',[\s\S]*?\n}\)/)?.[0] ?? ''
requireCondition(!installHandler.includes('skipWaiting'), 'new workers must wait for user approval')
requireCondition(sourceWorker.includes("event.data?.type !== 'SKIP_WAITING'"), 'worker must accept only SKIP_WAITING')
requireCondition(sourceWorker.includes('event.waitUntil(self.skipWaiting())'), 'SKIP_WAITING must extend message lifetime')
requireCondition(sourceWorker.includes('self.clients.claim()'), 'activation must claim clients')
requireCondition(!sourceWorker.includes('API_CACHE'), 'service worker must not cache API responses')
requireCondition(sourceWorker.includes('// ABS API and media: network-only'), 'ABS requests must remain network-only')
const mediaBypassAt = sourceWorker.indexOf("request.destination === 'audio'")
const absInterceptionAt = sourceWorker.indexOf("url.pathname.startsWith('/abs/')")
requireCondition(mediaBypassAt > 0, 'service worker must bypass native audio requests')
requireCondition(sourceWorker.includes("request.headers.has('range')"), 'service worker must bypass byte-range requests')
requireCondition(mediaBypassAt < absInterceptionAt, 'media bypass must run before ABS request interception')
requireCondition(mainSource.includes('startUpdateLifecycle'), 'main must start the update lifecycle')
requireCondition(updateHookSource.includes('subscribeToUpdateLifecycle'), 'hook must subscribe to lifecycle state')
requireCondition(lifecycleSource.includes("addEventListener('updatefound'"), 'lifecycle must observe installing workers')
requireCondition(lifecycleSource.includes("addEventListener('controllerchange'"), 'lifecycle must observe activation')
requireCondition(lifecycleSource.includes("updateViaCache: 'none'"), 'worker registration must bypass HTTP cache')
requireCondition(lifecycleSource.includes('60 * 60 * 1000'), 'automatic checks must be hourly')
requireCondition(lifecycleSource.includes("document.visibilityState === 'visible'"), 'visible apps must check overdue updates')
requireCondition(shellSource.includes('document.title ='), 'SPA routes must update the document title')
requireCondition(pullSource.includes('Math.abs(deltaX) > Math.abs(deltaY)'), 'pull refresh must reject horizontal gestures')
requireCondition(pullSource.includes('aria-live="polite"'), 'pull refresh needs a live status announcement')

const builtWorker = read('dist/sw.js')
requireCondition(!builtWorker.includes('__BUILD_VERSION__'), 'built worker still contains BUILD_VERSION')
requireCondition(!builtWorker.includes('__PRECACHE_ASSETS__'), 'built worker still contains PRECACHE_ASSETS')
for (const asset of ['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png']) {
  requireCondition(builtWorker.includes(`'${asset}'`), `built worker precache is missing ${asset}`)
}
requireCondition(read('dist/robots.txt').trim() === robotsSource.trim(), 'built robots.txt changed')

if (failures.length) {
  console.error('PWA contract failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('PWA contract passed (waiting-worker activation, network-only ABS requests)')
