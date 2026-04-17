import type { AudioTrack, BookItem, OfflineBook, PlaybackSession } from '../../lib/types'
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

export function buildOfflineSession(item: BookItem, offline: OfflineBook): PlaybackSession {
  let offset = 0
  return {
    id: `offline-${item.id}`,
    libraryItemId: item.id,
    duration: item.duration,
    displayTitle: item.title,
    displayAuthor: item.author,
    coverPath: item.coverPath,
    chapters: item.chapters,
    audioTracks: offline.tracks.map((t) => {
      const track: AudioTrack = {
        index: t.trackIndex,
        duration: t.duration,
        startOffset: offset,
        contentUrl: '',
        mimeType: t.mimeType,
        title: t.title,
      }
      offset += t.duration
      return track
    }),
  }
}

export function revokePlaybackSources(activePlayback: ActivePlayback | null) {
  activePlayback?.sources.forEach((source) => {
    if (source.startsWith('blob:')) {
      URL.revokeObjectURL(source)
    }
  })
}
