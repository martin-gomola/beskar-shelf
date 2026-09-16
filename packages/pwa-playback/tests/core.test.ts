import { describe, expect, it, vi } from 'vitest'

import { revokeObjectUrls, totalTimeFromTrack, trackForTime } from '../src/index.ts'

const tracks = [
  { startOffset: 0, duration: 30 },
  { startOffset: 30, duration: 45 },
]

describe('pwa playback core', () => {
  it('maps absolute playback time to a track', () => {
    expect(trackForTime(tracks, -1)).toBe(0)
    expect(trackForTime(tracks, 30)).toBe(1)
    expect(trackForTime(tracks, 999)).toBe(1)
  })

  it('maps a track-local time back to absolute time', () => {
    expect(totalTimeFromTrack(tracks, 1, 12)).toBe(42)
  })

  it('revokes only object URLs', () => {
    const revoke = vi.fn()
    revokeObjectUrls(['blob:one', 'https://example.test/remote'], revoke)
    expect(revoke).toHaveBeenCalledWith('blob:one')
    expect(revoke).toHaveBeenCalledTimes(1)
  })
})
