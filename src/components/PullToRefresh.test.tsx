import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PullToRefresh } from './PullToRefresh'

function dispatchTouch(type: string, clientY?: number) {
  const event = new Event(type, { cancelable: true })
  Object.defineProperty(event, 'touches', {
    value: clientY == null ? [] : [{ clientY }],
  })
  window.dispatchEvent(event)
}

describe('PullToRefresh', () => {
  it('refreshes after a downward pull from the top of the page', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<PullToRefresh onRefresh={onRefresh} />)

    dispatchTouch('touchstart', 0)
    dispatchTouch('touchmove', 150)
    dispatchTouch('touchend')

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })
  })

  it('ignores pulls when disabled', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<PullToRefresh disabled onRefresh={onRefresh} />)

    dispatchTouch('touchstart', 0)
    dispatchTouch('touchmove', 150)
    dispatchTouch('touchend')

    expect(onRefresh).not.toHaveBeenCalled()
  })
})
