import { createContext, useContext } from 'react'

import type { ActivePlayback } from '../hooks/usePlayback'

export interface PlayerContextValue {
  activePlayback: ActivePlayback | null
  isPlaying: boolean
  playbackRate: number
  togglePlayback: () => Promise<void>
  stopPlayback: () => void
  seekTo: (seconds: number) => void
  seekBy: (delta: number) => void
  setPlaybackRate: (rate: number) => void
  jumpToTrack: (index: number) => void
  audioRef: React.RefObject<HTMLAudioElement | null>
}

export interface PlayerTimeContextValue {
  playbackTime: number
  currentTrackDuration: number
}

export const PlayerContext = createContext<PlayerContextValue | null>(null)
export const PlayerTimeContext = createContext<PlayerTimeContextValue>({ playbackTime: 0, currentTrackDuration: 0 })

export function usePlayerContext() {
  const context = useContext(PlayerContext)
  if (!context) {
    throw new Error('Player context is not available.')
  }
  return context
}

export function usePlayerTime() {
  return useContext(PlayerTimeContext)
}
