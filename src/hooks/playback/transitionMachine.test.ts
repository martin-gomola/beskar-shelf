import { describe, expect, it } from 'vitest'

import {
  createTransitionState,
  reduceTransition,
} from './transitionMachine'

describe('playback transition machine', () => {
  it('advances a track through assignment, bounded retry, and playback', () => {
    let state = createTransitionState('session-1', 0)

    state = reduceTransition(state, { type: 'track-ended', totalTracks: 2 })
    expect(state).toMatchObject({ phase: 'advancing', targetTrackIndex: 1, attempts: 0 })

    state = reduceTransition(state, { type: 'source-assigned' })
    state = reduceTransition(state, { type: 'play-attempted' })
    state = reduceTransition(state, { type: 'play-failed' })
    expect(state).toMatchObject({ phase: 'stalled', targetTrackIndex: 1, attempts: 1 })

    state = reduceTransition(state, { type: 'play-attempted' })
    state = reduceTransition(state, { type: 'playing' })
    expect(state).toEqual(createTransitionState('session-1', 1))
  })

  it('bounds retries but resets them when the app returns to the foreground', () => {
    let state = createTransitionState('session-1', 0)
    state = reduceTransition(state, { type: 'track-ended', totalTracks: 2 })
    state = reduceTransition(state, { type: 'source-assigned' })

    for (let attempt = 0; attempt < 4; attempt += 1) {
      state = reduceTransition(state, { type: 'play-attempted' })
      state = reduceTransition(state, { type: 'play-failed' })
    }
    expect(state).toMatchObject({ phase: 'stalled', attempts: 3 })

    state = reduceTransition(state, { type: 'foregrounded' })
    expect(state).toMatchObject({ phase: 'waiting', attempts: 0, targetTrackIndex: 1 })
  })

  it('marks completion when the final track ends', () => {
    const state = reduceTransition(
      createTransitionState('session-1', 1),
      { type: 'track-ended', totalTracks: 2 },
    )

    expect(state).toMatchObject({ phase: 'complete', targetTrackIndex: null })
  })
})
