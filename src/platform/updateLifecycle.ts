export type UpdateCheckResult = 'current' | 'update-found' | 'unavailable'

type UpdateListener = (waitingWorker: ServiceWorker | null) => void

const listeners = new Set<UpdateListener>()
const observedRegistrations = new WeakSet<ServiceWorkerRegistration>()

let registration: ServiceWorkerRegistration | null = null
let waitingWorker: ServiceWorker | null = null
let started = false
let hadController = false
let reloaded = false

function notifyListeners() {
  listeners.forEach((listener) => listener(waitingWorker))
}

function setWaitingWorker(worker: ServiceWorker | null) {
  if (waitingWorker === worker) return
  waitingWorker = worker
  notifyListeners()
}

function showWaitingWorker(worker: ServiceWorker | null) {
  if (worker && hadController) setWaitingWorker(worker)
}

function waitForInstallingWorker(nextRegistration: ServiceWorkerRegistration) {
  const worker = nextRegistration.installing
  if (!worker || worker.state !== 'installing') return Promise.resolve()

  return new Promise<void>((resolve) => {
    let timeoutId = 0
    const settle = () => {
      window.clearTimeout(timeoutId)
      worker.removeEventListener('statechange', onStateChange)
      resolve()
    }
    const onStateChange = () => {
      if (worker.state !== 'installing') settle()
    }

    worker.addEventListener('statechange', onStateChange)
    timeoutId = window.setTimeout(settle, 10_000)
  })
}

function observeRegistration(nextRegistration: ServiceWorkerRegistration) {
  registration = nextRegistration
  showWaitingWorker(nextRegistration.waiting)
  if (observedRegistrations.has(nextRegistration)) return
  observedRegistrations.add(nextRegistration)

  nextRegistration.addEventListener('updatefound', () => {
    const worker = nextRegistration.installing
    if (!worker) return
    const onStateChange = () => {
      if (worker.state === 'installed') showWaitingWorker(nextRegistration.waiting ?? worker)
      if (worker.state === 'installed' || worker.state === 'redundant') {
        worker.removeEventListener('statechange', onStateChange)
      }
    }
    worker.addEventListener('statechange', onStateChange)
    onStateChange()
  })
}

function reloadAfterUpdate() {
  const readerMatch = window.location.pathname.match(/^\/read\/(.+)$/)
  if (readerMatch) {
    window.location.replace(`/book/${readerMatch[1]}`)
  } else {
    window.location.reload()
  }
}

function scheduleUpdateChecks(nextRegistration: ServiceWorkerRegistration) {
  const interval = 60 * 60 * 1000
  let lastCheckAt = Date.now()
  const check = () => {
    lastCheckAt = Date.now()
    void nextRegistration.update().catch((error) => {
      console.info('Service-worker update check skipped:', error)
    })
  }

  window.setInterval(check, interval)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheckAt >= interval) check()
  })
}

export function startUpdateLifecycle() {
  if (started || !('serviceWorker' in navigator)) return
  started = true
  hadController = Boolean(navigator.serviceWorker.controller)

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) {
      reloaded = true
      reloadAfterUpdate()
    }
    hadController = true
  })

  void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    .then((nextRegistration) => {
      observeRegistration(nextRegistration)
      scheduleUpdateChecks(nextRegistration)
    })
    .catch((error) => {
      console.info('Service-worker registration failed:', error)
    })
}

export function subscribeToUpdateLifecycle(listener: UpdateListener) {
  listeners.add(listener)
  listener(waitingWorker)
  return () => {
    listeners.delete(listener)
  }
}

export function applyWaitingUpdate() {
  waitingWorker?.postMessage({ type: 'SKIP_WAITING' })
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!('serviceWorker' in navigator)) return 'unavailable'

  const nextRegistration = registration ?? await navigator.serviceWorker.getRegistration()
  if (!nextRegistration) return 'unavailable'

  observeRegistration(nextRegistration)
  if (nextRegistration.waiting && navigator.serviceWorker.controller) {
    setWaitingWorker(nextRegistration.waiting)
    return 'update-found'
  }

  await nextRegistration.update()
  await waitForInstallingWorker(nextRegistration)
  if (nextRegistration.waiting && navigator.serviceWorker.controller) {
    setWaitingWorker(nextRegistration.waiting)
    return 'update-found'
  }
  return 'current'
}
