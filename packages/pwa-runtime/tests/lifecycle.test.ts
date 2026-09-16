import { describe, expect, it, vi } from 'vitest'

import { createPwaUpdateLifecycle } from '../src/index.ts'

describe('pwa runtime update lifecycle', () => {
  it('exposes a waiting worker only after a controlled update check', async () => {
    const waiting = { postMessage: vi.fn() } as unknown as ServiceWorker
    const registration = {
      waiting,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn(),
    } as unknown as ServiceWorkerRegistration
    const serviceWorker = {
      controller: {} as ServiceWorker,
      addEventListener: vi.fn(),
      getRegistration: vi.fn().mockResolvedValue(registration),
      register: vi.fn(),
    } as unknown as ServiceWorkerContainer
    const lifecycle = createPwaUpdateLifecycle({ serviceWorker })
    const observed: Array<ServiceWorker | null> = []
    lifecycle.subscribe((worker) => observed.push(worker))

    await expect(lifecycle.check()).resolves.toBe('update-found')
    lifecycle.apply()

    expect(observed).toEqual([null, waiting])
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(registration.update).not.toHaveBeenCalled()
  })
})
