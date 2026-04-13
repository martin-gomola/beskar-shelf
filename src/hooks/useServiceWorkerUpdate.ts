import { useState, useEffect } from 'react'

/**
 * Detects when a new service worker version is active after a deploy.
 * Shows an update banner so the user can reload to get the latest code.
 *
 * Flow:
 * - sw.js uses skipWaiting() + clients.claim() so new SWs activate immediately
 * - When a new SW takes control, the 'controllerchange' event fires
 * - First-install is ignored (no banner); subsequent changes show banner
 * - main.tsx calls reg.update() every 5 min to check for new deployments
 */
export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let hasController = !!navigator.serviceWorker.controller

    const onControllerChange = () => {
      if (hasController) {
        setUpdateAvailable(true)
      }
      hasController = true
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  const reload = () => window.location.reload()

  return { updateAvailable, reload }
}
