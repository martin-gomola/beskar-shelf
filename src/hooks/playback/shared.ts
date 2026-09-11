import type { AudioTrack, BookItem, OfflineBook, PlaybackSession } from '../../lib/types'

export interface ActivePlayback {
  item: BookItem
  session: PlaybackSession
  sources: string[]
  trackIndex: number
  duration: number
}

export function trackForTime(tracks: AudioTrack[], currentTime: number) {
  if (tracks.length === 0) {
    return 0
  }

  const target = Math.max(0, currentTime)
  const found = tracks.findIndex((track) => {
    const end = track.startOffset + track.duration
    return target >= track.startOffset && target < end
  })
  return found === -1 ? tracks.length - 1 : found
}

export function totalTimeFromTrack(activePlayback: ActivePlayback | null, audioTime: number) {
  if (!activePlayback) {
    return 0
  }
  const track = activePlayback.session.audioTracks[activePlayback.trackIndex]
  return (track?.startOffset ?? 0) + audioTime
}

export function enableBackgroundAudio() {
  const audioSession = (navigator as Navigator & {
    audioSession?: { type: string }
  }).audioSession
  if (!audioSession) {
    return
  }
  try {
    audioSession.type = 'playback'
  } catch {
    // The experimental API may reject changes in unsupported contexts.
  }
}

export function hasCompleteOfflineTracks(item: BookItem, offline: OfflineBook) {
  if (offline.status !== 'downloaded' || offline.tracks.length === 0) {
    return false
  }
  if (offline.tracks.some((track) => !track.blob)) {
    return false
  }

  const expectedTracks = offline.totalTracks ?? item.audioTracks.length
  return expectedTracks === 0 || offline.tracks.length >= expectedTracks
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
