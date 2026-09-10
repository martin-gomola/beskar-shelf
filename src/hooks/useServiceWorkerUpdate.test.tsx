import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const lifecycle = vi.hoisted(() => {
  let listener: ((worker: ServiceWorker | null) => void) | null = null
  return {
    applyWaitingUpdate: vi.fn(),
    checkForUpdate: vi.fn().mockResolvedValue('current'),
    subscribeToUpdateLifecycle: vi.fn((nextListener: typeof listener) => {
      listener = nextListener
      nextListener?.(null)
      return () => { listener = null }
    }),
    emit(worker: ServiceWorker | null) {
      listener?.(worker)
    },
  }
})

vi.mock('../platform/updateLifecycle', () => lifecycle)

import { useServiceWorkerUpdate } from './useServiceWorkerUpdate'

function HookProbe() {
  const { updateAvailable, applyUpdate, checkForUpdate } = useServiceWorkerUpdate()
  return (
    <>
      <span>{updateAvailable ? 'update-visible' : 'update-hidden'}</span>
      <button onClick={applyUpdate}>apply-update</button>
      <button onClick={() => void checkForUpdate()}>check-for-update</button>
    </>
  )
}

describe('useServiceWorkerUpdate', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('exposes waiting updates and delegates both actions', async () => {
    const user = userEvent.setup()
    render(<HookProbe />)

    act(() => lifecycle.emit({} as ServiceWorker))
    expect(screen.getByText('update-visible')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'apply-update' }))
    await user.click(screen.getByRole('button', { name: 'check-for-update' }))

    expect(lifecycle.applyWaitingUpdate).toHaveBeenCalledOnce()
    expect(lifecycle.checkForUpdate).toHaveBeenCalledOnce()
  })
})
