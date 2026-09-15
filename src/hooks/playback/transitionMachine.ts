export const MAX_TRANSITION_ATTEMPTS = 3

export type TransitionPhase =
  | 'playing'
  | 'advancing'
  | 'waiting'
  | 'stalled'
  | 'complete'

export interface TransitionState {
  sessionId: string
  phase: TransitionPhase
  currentTrackIndex: number
  targetTrackIndex: number | null
  attempts: number
}

export type TransitionEvent =
  | { type: 'track-ended', totalTracks: number }
  | { type: 'source-assigned' }
  | { type: 'play-attempted' }
  | { type: 'play-failed' }
  | { type: 'playing' }
  | { type: 'foregrounded' }

export function createTransitionState(sessionId: string, trackIndex: number): TransitionState {
  return {
    sessionId,
    phase: 'playing',
    currentTrackIndex: trackIndex,
    targetTrackIndex: null,
    attempts: 0,
  }
}

export function reduceTransition(state: TransitionState, event: TransitionEvent): TransitionState {
  switch (event.type) {
    case 'track-ended': {
      const nextTrackIndex = state.currentTrackIndex + 1
      if (nextTrackIndex >= event.totalTracks) {
        return { ...state, phase: 'complete', targetTrackIndex: null, attempts: 0 }
      }
      return {
        ...state,
        phase: 'advancing',
        targetTrackIndex: nextTrackIndex,
        attempts: 0,
      }
    }
    case 'source-assigned':
      return state.targetTrackIndex == null
        ? state
        : { ...state, phase: 'waiting' }
    case 'play-attempted':
      return state.targetTrackIndex == null || state.attempts >= MAX_TRANSITION_ATTEMPTS
        ? state
        : { ...state, phase: 'waiting', attempts: state.attempts + 1 }
    case 'play-failed':
      return state.targetTrackIndex == null
        ? state
        : { ...state, phase: 'stalled' }
    case 'playing':
      return createTransitionState(
        state.sessionId,
        state.targetTrackIndex ?? state.currentTrackIndex,
      )
    case 'foregrounded':
      return state.targetTrackIndex == null
        ? state
        : { ...state, phase: 'waiting', attempts: 0 }
  }
}

export function canAttemptTransition(state: TransitionState) {
  return state.targetTrackIndex != null
    && state.attempts < MAX_TRANSITION_ATTEMPTS
    && (state.phase === 'waiting' || state.phase === 'stalled')
}
