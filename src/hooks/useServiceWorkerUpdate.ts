import { useState, useEffect, useCallback } from 'react'

import {
  applyWaitingUpdate,
  checkForUpdate,
  subscribeToUpdateLifecycle,
} from '../platform/updateLifecycle'

/**
 * React adapter for the shared service-worker lifecycle.
 */
export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => subscribeToUpdateLifecycle((worker) => {
    setUpdateAvailable(Boolean(worker))
  }), [])

  const applyUpdate = useCallback(() => applyWaitingUpdate(), [])
  const check = useCallback(() => checkForUpdate(), [])

  return { updateAvailable, applyUpdate, checkForUpdate: check }
}
