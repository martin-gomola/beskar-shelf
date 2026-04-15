import type { AudioTrack, BookItem, PlaybackSession } from '../../lib/types'
import { clamp } from '../../lib/utils'

export interface ActivePlayback {
  item: BookItem
  session: PlaybackSession
  sources: string[]
  trackIndex: number
  duration: number
}

export function trackForTime(tracks: AudioTrack[], currentTime: number) {
  const target = clamp(currentTime, 0, Math.max(currentTime, tracks.at(-1)?.startOffset ?? 0))
  const found = tracks.findIndex((track) => {
    const end = track.startOffset + track.duration
    return target >= track.startOffset && target < end
  })
  return found === -1 ? 0 : found
}

export function totalTimeFromTrack(activePlayback: ActivePlayback | null, audioTime: number) {
  if (!activePlayback) {
    return 0
  }
  const track = activePlayback.session.audioTracks[activePlayback.trackIndex]
  return (track?.startOffset ?? 0) + audioTime
}

export function revokePlaybackSources(activePlayback: ActivePlayback | null) {
  activePlayback?.sources.forEach((source) => {
    if (source.startsWith('blob:')) {
      URL.revokeObjectURL(source)
    }
  })
}
