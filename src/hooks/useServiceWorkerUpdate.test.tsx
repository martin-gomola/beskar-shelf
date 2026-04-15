import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useServiceWorkerUpdate } from './useServiceWorkerUpdate'

function HookProbe() {
  const { updateAvailable, checkForUpdate } = useServiceWorkerUpdate()
  return (
    <>
      <span>{updateAvailable ? 'update-visible' : 'update-hidden'}</span>
      <button onClick={() => void checkForUpdate()}>check-for-update</button>
    </>
  )
}

type SWListener = () => void

function installServiceWorkerMock(hasController: boolean) {
  const listeners = new Map<string, SWListener>()
  const update = vi.fn().mockResolvedValue(undefined)
  const serviceWorker = {
    controller: hasController ? {} : null,
    getRegistration: vi.fn().mockResolvedValue({ update }),
    addEventListener: vi.fn((event: string, listener: SWListener) => {
      listeners.set(event, listener)
    }),
    removeEventListener: vi.fn((event: string) => {
      listeners.delete(event)
    }),
  }

  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  })

  return {
    update,
    dispatch(event: string) {
      listeners.get(event)?.()
    },
  }
}

describe('useServiceWorkerUpdate', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    })
  })

  it('ignores the first controller change when the page had no controller yet', () => {
    const sw = installServiceWorkerMock(false)

    render(
      <MemoryRouter>
        <HookProbe />
      </MemoryRouter>,
    )

    expect(screen.getByText('update-hidden')).toBeInTheDocument()

    act(() => {
      sw.dispatch('controllerchange')
    })
    expect(screen.getByText('update-hidden')).toBeInTheDocument()

    act(() => {
      sw.dispatch('controllerchange')
    })
    expect(screen.getByText('update-visible')).toBeInTheDocument()
  })

  it('shows the update state immediately when an existing controller changes', () => {
    const sw = installServiceWorkerMock(true)

    render(
      <MemoryRouter>
        <HookProbe />
      </MemoryRouter>,
    )

    act(() => {
      sw.dispatch('controllerchange')
    })
    expect(screen.getByText('update-visible')).toBeInTheDocument()
  })

  it('checks the active service worker registration on demand', async () => {
    const user = userEvent.setup()
    const sw = installServiceWorkerMock(true)

    render(
      <MemoryRouter>
        <HookProbe />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'check-for-update' }))
    expect(sw.update).toHaveBeenCalledTimes(1)
  })
})
