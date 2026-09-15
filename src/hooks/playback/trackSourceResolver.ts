import type { AudiobookshelfClient } from '../../lib/api'
import { cachePlayedTrack } from '../../lib/downloads'
import type { ActivePlayback } from './shared'

type TrackBlobLoader = (
  client: AudiobookshelfClient,
  playback: ActivePlayback,
  trackIndex: number,
) => Promise<Blob | null>

interface ObjectUrlPort {
  create: (blob: Blob) => string
  revoke: (url: string) => void
}

const browserObjectUrls: ObjectUrlPort = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
}

export class TrackSourceResolver {
  private sessionId: string | null = null
  private currentTrackIndex = -1
  private readonly prefetchedSources = new Map<string, string>()
  private readonly inFlight = new Set<string>()
  private readonly loadTrackBlob: TrackBlobLoader
  private readonly objectUrls: ObjectUrlPort

  constructor(
    loadTrackBlob: TrackBlobLoader = cachePlayedTrack,
    objectUrls: ObjectUrlPort = browserObjectUrls,
  ) {
    this.loadTrackBlob = loadTrackBlob
    this.objectUrls = objectUrls
  }

  activateSession(sessionId: string | null, currentTrackIndex = -1) {
    if (this.sessionId !== sessionId) {
      this.clear()
      this.sessionId = sessionId
    }
    this.currentTrackIndex = currentTrackIndex

    for (const [key, source] of this.prefetchedSources) {
      if (trackIndexFromKey(key) <= currentTrackIndex) {
        this.objectUrls.revoke(source)
        this.prefetchedSources.delete(key)
      }
    }
  }

  async prefetch(
    client: AudiobookshelfClient,
    playback: ActivePlayback,
    trackIndex: number,
  ) {
    const source = playback.sources[trackIndex]
    if (
      this.sessionId !== playback.session.id
      || !source
      || source.startsWith('blob:')
    ) {
      return false
    }

    const key = sourceKey(playback.session.id, trackIndex)
    if (this.prefetchedSources.has(key) || this.inFlight.has(key)) {
      return false
    }

    this.inFlight.add(key)
    try {
      const blob = await this.loadTrackBlob(client, playback, trackIndex)
      if (
        !blob
        || this.sessionId !== playback.session.id
        || trackIndex <= this.currentTrackIndex
      ) {
        return false
      }

      const objectUrl = this.objectUrls.create(blob)
      if (this.sessionId !== playback.session.id || this.prefetchedSources.has(key)) {
        this.objectUrls.revoke(objectUrl)
        return false
      }
      this.prefetchedSources.set(key, objectUrl)
      return true
    } finally {
      this.inFlight.delete(key)
    }
  }

  consume(playback: ActivePlayback, trackIndex: number) {
    const key = sourceKey(playback.session.id, trackIndex)
    const prefetchedSource = this.prefetchedSources.get(key)
    if (!prefetchedSource) {
      return playback.sources
    }

    this.prefetchedSources.delete(key)
    return playback.sources.map((source, index) => (
      index === trackIndex ? prefetchedSource : source
    ))
  }

  clear() {
    for (const source of this.prefetchedSources.values()) {
      this.objectUrls.revoke(source)
    }
    this.prefetchedSources.clear()
    this.inFlight.clear()
    this.currentTrackIndex = -1
  }
}

function sourceKey(sessionId: string, trackIndex: number) {
  return `${sessionId}:${trackIndex}`
}

function trackIndexFromKey(key: string) {
  return Number(key.slice(key.lastIndexOf(':') + 1))
}
