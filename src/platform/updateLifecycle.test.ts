import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('update lifecycle', () => {
  it('exposes and activates a waiting worker only on request', async () => {
    const postMessage = vi.fn()
    const waitingWorker = { postMessage } as unknown as ServiceWorker
    const registration = {
      waiting: waitingWorker,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn(),
    } as unknown as ServiceWorkerRegistration

    vi.stubGlobal('navigator', {
      serviceWorker: {
        controller: {} as ServiceWorker,
        getRegistration: vi.fn().mockResolvedValue(registration),
      },
    })

    const lifecycle = await import('./updateLifecycle')
    const observedWorkers: Array<ServiceWorker | null> = []
    lifecycle.subscribeToUpdateLifecycle((worker) => observedWorkers.push(worker))

    await expect(lifecycle.checkForUpdate()).resolves.toBe('update-found')
    lifecycle.applyWaitingUpdate()

    expect(observedWorkers).toEqual([null, waitingWorker])
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(registration.update).not.toHaveBeenCalled()
  })
})
