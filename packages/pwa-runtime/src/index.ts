export type UpdateCheckResult = 'current' | 'update-found' | 'unavailable'

export interface PwaUpdateLifecycle {
  start(): void
  subscribe(listener: (waitingWorker: ServiceWorker | null) => void): () => void
  apply(): void
  check(): Promise<UpdateCheckResult>
}

export interface PwaUpdateLifecycleOptions {
  serviceWorker?: ServiceWorkerContainer
  reload?: () => void
  intervalMs?: number
  now?: () => number
}

export function createPwaUpdateLifecycle(options: PwaUpdateLifecycleOptions): PwaUpdateLifecycle {
  const listeners = new Set<(worker: ServiceWorker | null) => void>()
  const serviceWorker = options.serviceWorker
  const reload = options.reload ?? (() => window.location.reload())
  const now = options.now ?? Date.now
  const intervalMs = options.intervalMs ?? 60 * 60 * 1000
  let registration: ServiceWorkerRegistration | null = null
  let waitingWorker: ServiceWorker | null = null
  let started = false
  let hadController = false
  let reloaded = false
  let lastCheckAt = now()

  const notify = () => listeners.forEach((listener) => listener(waitingWorker))
  const setWaiting = (worker: ServiceWorker | null) => {
    if (waitingWorker === worker) return
    waitingWorker = worker
    notify()
  }
  const showWaiting = (worker: ServiceWorker | null) => {
    if (worker && hadController) setWaiting(worker)
  }

  function observe(nextRegistration: ServiceWorkerRegistration) {
    registration = nextRegistration
    showWaiting(nextRegistration.waiting)
    nextRegistration.addEventListener('updatefound', () => {
      const worker = nextRegistration.installing
      if (!worker) return
      const onStateChange = () => {
        if (worker.state === 'installed') showWaiting(nextRegistration.waiting ?? worker)
        if (worker.state === 'installed' || worker.state === 'redundant') {
          worker.removeEventListener('statechange', onStateChange)
        }
      }
      worker.addEventListener('statechange', onStateChange)
      onStateChange()
    })
  }

  function scheduleChecks(nextRegistration: ServiceWorkerRegistration) {
    window.setInterval(() => {
      lastCheckAt = now()
      void nextRegistration.update().catch(() => undefined)
    }, intervalMs)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && now() - lastCheckAt >= intervalMs) {
        lastCheckAt = now()
        void nextRegistration.update().catch(() => undefined)
      }
    })
  }

  async function waitForInstalling(nextRegistration: ServiceWorkerRegistration) {
    const worker = nextRegistration.installing
    if (!worker || worker.state !== 'installing') return
    await new Promise<void>((resolve) => {
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

  return {
    start() {
      if (started || !serviceWorker) return
      started = true
      hadController = Boolean(serviceWorker.controller)
      serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && !reloaded) {
          reloaded = true
          reload()
        }
        hadController = true
      })
      void serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then((nextRegistration) => {
          observe(nextRegistration)
          scheduleChecks(nextRegistration)
        })
        .catch(() => undefined)
    },
    subscribe(listener) {
      listeners.add(listener)
      listener(waitingWorker)
      return () => listeners.delete(listener)
    },
    apply() {
      waitingWorker?.postMessage({ type: 'SKIP_WAITING' })
    },
    async check() {
      if (!serviceWorker) return 'unavailable'
      const nextRegistration = registration ?? await serviceWorker.getRegistration()
      if (!nextRegistration) return 'unavailable'
      observe(nextRegistration)
      if (nextRegistration.waiting && serviceWorker.controller) {
        setWaiting(nextRegistration.waiting)
        return 'update-found'
      }
      await nextRegistration.update()
      await waitForInstalling(nextRegistration)
      if (nextRegistration.waiting && serviceWorker.controller) {
        setWaiting(nextRegistration.waiting)
        return 'update-found'
      }
      return 'current'
    },
  }
}
