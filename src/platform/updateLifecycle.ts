import { createPwaUpdateLifecycle, type UpdateCheckResult } from '@mgomola/pwa-runtime'

function reloadAfterUpdate() {
  const readerMatch = window.location.pathname.match(/^\/read\/(.+)$/)
  if (readerMatch) {
    window.location.replace(`/book/${readerMatch[1]}`)
  } else {
    window.location.reload()
  }
}

const lifecycle = createPwaUpdateLifecycle({
  serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
  reload: reloadAfterUpdate,
})

export type { UpdateCheckResult }

export function startUpdateLifecycle() {
  lifecycle.start()
}

export function subscribeToUpdateLifecycle(listener: (waitingWorker: ServiceWorker | null) => void) {
  return lifecycle.subscribe(listener)
}

export function applyWaitingUpdate() {
  lifecycle.apply()
}

export function checkForUpdate(): Promise<UpdateCheckResult> {
  return lifecycle.check()
}
