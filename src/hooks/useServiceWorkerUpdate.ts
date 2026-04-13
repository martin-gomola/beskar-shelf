import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Detects when a new service worker version is active after a deploy.
 * Shows an update banner so the user can reload to get the latest code.
 *
 * Flow:
 * - sw.js uses skipWaiting() + clients.claim() so new SWs activate immediately
 * - When a new SW takes control, the 'controllerchange' event fires
 * - First-install is ignored (no banner); subsequent changes show banner
 * - main.tsx calls reg.update() every 5 min to check for new deployments
 *
 * If the user is on the reader page (/read/*), reload navigates to the
 * book detail page first so the reader doesn't re-open after refresh.
 */
export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const location = useLocation()

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

  const reload = useCallback(() => {
    const readerMatch = location.pathname.match(/^\/read\/(.+)$/)
    if (readerMatch) {
      window.location.replace(`/book/${readerMatch[1]}`)
    } else {
      window.location.reload()
    }
  }, [location.pathname])

  return { updateAvailable, reload }
}
