import { createContext, useContext } from 'react'

import type { ActivePlayback } from '../hooks/usePlayback'

export interface PlayerContextValue {
  activePlayback: ActivePlayback | null
  playbackTime: number
  isPlaying: boolean
  playbackRate: number
  currentTrackDuration: number
  togglePlayback: () => Promise<void>
  seekTo: (seconds: number) => void
  seekBy: (delta: number) => void
  setPlaybackRate: (rate: number) => void
  jumpToTrack: (index: number) => void
  audioRef: React.RefObject<HTMLAudioElement | null>
}

export const PlayerContext = createContext<PlayerContextValue | null>(null)

export function usePlayerContext() {
  const context = useContext(PlayerContext)
  if (!context) {
    throw new Error('Player context is not available.')
  }
  return context
}
