import { z } from 'zod'

import type {
  AudioTrack,
  Bookmark,
  BookItem,
  Chapter,
  Library,
  PlaybackSession,
  ProgressPayload,
  ServerConfig,
  UserSession,
} from './types'
import { normalizeBaseUrl, sumDurations } from './utils'

const proxyBase = normalizeBaseUrl(import.meta.env.VITE_ABS_PROXY_BASE ?? '')

const loginSchema = z.object({
  user: z
    .object({
      id: z.string(),
      username: z.string(),
      token: z.string(),
      type: z.string().optional(),
    })
    .optional(),
  response: z
    .object({
      user: z.object({
        id: z.string(),
        username: z.string(),
        token: z.string(),
        type: z.string().optional(),
      }),
    })
    .optional(),
})

export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SessionExpiredError'
  }
}

function asRecord(value: unknown) {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

function chapterFromUnknown(value: unknown, index: number): Chapter {
  const chapter = asRecord(value)
  const start = Number(chapter.start ?? chapter.startTime ?? 0)
  const end = Number(chapter.end ?? chapter.endTime ?? start)

  return {
    id: (chapter.id as string | number | undefined) ?? index,
    title: String(chapter.title ?? `Chapter ${index + 1}`),
    start,
    end,
  }
}

function trackFromUnknown(value: unknown, index: number): AudioTrack {
  const track = asRecord(value)
  const metadata = asRecord(track.metadata)
  const duration = Number(track.duration ?? metadata.duration ?? 0)
  return {
    index,
    duration,
    startOffset: 0,
    contentUrl: String(track.contentUrl ?? track.url ?? ''),
    mimeType: String(track.mimeType ?? metadata.mimeType ?? 'audio/mpeg'),
    title: String(track.title ?? metadata.filename ?? `Track ${index + 1}`),
  }
}

function withTrackOffsets(tracks: AudioTrack[]) {
  let offset = 0
  return tracks.map((track) => {
    const next = { ...track, startOffset: offset }
    offset += track.duration
    return next
  })
}

function bookFromUnknown(value: unknown): BookItem {
  const item = asRecord(value)
  const books = Array.isArray(item.books) ? item.books.map(asRecord) : []
  const representativeBook = books[0] ?? null
  const representativeMedia = asRecord(representativeBook?.media)
  const media = Object.keys(asRecord(item.media)).length > 0
    ? asRecord(item.media)
    : representativeMedia
  const metadata = asRecord(media.metadata)
  const progress = asRecord(item.userMediaProgress ?? item.progress ?? item.mediaProgress)
  const chapters = Array.isArray(media.chapters)
    ? media.chapters.map(chapterFromUnknown)
    : []
  const tracks = Array.isArray(media.audioTracks)
    ? withTrackOffsets(media.audioTracks.map(trackFromUnknown))
    : []
  const ebooks = Array.isArray(media.ebookFiles)
    ? media.ebookFiles.map(asRecord)
    : []

  const representativePath = String(representativeBook?.relPath ?? representativeBook?.path ?? '')
  const pathAuthor = representativePath.split('/').filter(Boolean)[0] ?? ''
  const isSeriesEntity = !('media' in item) && books.length > 0

  return {
    id: String(isSeriesEntity ? representativeBook?.id : item.id ?? representativeBook?.id ?? ''),
    libraryId: String(item.libraryId ?? representativeBook?.libraryId ?? ''),
    title: String(metadata.title ?? item.title ?? item.name ?? 'Untitled'),
    author: String(metadata.author || metadata.authorName || item.author || pathAuthor || 'Unknown author'),
    narrator: String(metadata.narratorName ?? metadata.narrator ?? '') || null,
    description: String(metadata.description ?? ''),
    coverPath: typeof item.coverPath === 'string'
      ? item.coverPath
      : typeof media.coverPath === 'string'
        ? media.coverPath
        : null,
    duration: Number(media.duration ?? sumDurations(tracks.map((track) => track.duration))),
    size: Number(media.size ?? 0),
    genres: Array.isArray(metadata.genres)
      ? metadata.genres.map((genre) => String(genre))
      : [],
    progress: Number(progress.progress ?? progress.ebookProgress ?? 0),
    currentTime: Number(progress.currentTime ?? 0),
    isFinished: Boolean(progress.isFinished),
    chapters,
    audioTracks: tracks,
    ebookFormat: String(media.ebookFormat ?? asRecord(media.ebookFile).ebookFormat ?? asRecord(ebooks[0]).ebookFormat ?? '') || null,
    ebookLocation: typeof progress.ebookLocation === 'string' ? String(progress.ebookLocation) : null,
    ebookProgress: Number(progress.ebookProgress ?? 0),
  }
}

function isBrowsableBookEntity(value: unknown) {
  const item = asRecord(value)
  if ('media' in item) {
    return true
  }

  return Array.isArray(item.books) && item.books.length > 0
}

function playbackFromUnknown(value: unknown): PlaybackSession {
  const session = asRecord(value)
  const rawTracks = Array.isArray(session.audioTracks)
    ? session.audioTracks.map(trackFromUnknown)
    : []

  return {
    id: String(session.id ?? ''),
    libraryItemId: String(session.libraryItemId ?? ''),
    duration: Number(session.duration ?? sumDurations(rawTracks.map((track) => track.duration))),
    displayTitle: String(session.displayTitle ?? session.title ?? 'Untitled'),
    displayAuthor: String(session.displayAuthor ?? session.author ?? 'Unknown author'),
    coverPath: typeof session.coverPath === 'string' ? session.coverPath : null,
    chapters: Array.isArray(session.chapters)
      ? session.chapters.map(chapterFromUnknown)
      : [],
    audioTracks: withTrackOffsets(rawTracks),
  }
}

export class AudiobookshelfClient {
  private readonly baseUrl: string
  private readonly session: UserSession | null
  private readonly server: ServerConfig | null

  constructor(server: ServerConfig | null, session: UserSession | null) {
    this.server = server
    this.session = session
    this.baseUrl = normalizeBaseUrl(server?.baseUrl ?? '')
  }

  hasServer() {
    return Boolean(this.baseUrl)
  }

  hasSession() {
    return Boolean(this.session?.token)
  }

  private requestBase() {
    if (this.server?.mode === 'proxy' && proxyBase) {
      return `${window.location.origin}${proxyBase}`
    }

    return this.baseUrl
  }

  absoluteUrl(path: string) {
    if (/^https?:\/\//.test(path)) {
      return path
    }

    const base = this.requestBase()
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`
  }

  coverUrl(itemId: string) {
    const url = new URL(this.absoluteUrl(`/api/items/${itemId}/cover`))
    if (this.session?.token) {
      url.searchParams.set('token', this.session.token)
    }
    return url.toString()
  }

  assetUrl(path: string | null) {
    if (!path) {
      return null
    }

    const url = new URL(this.absoluteUrl(path))
    if (this.session?.token) {
      url.searchParams.set('token', this.session.token)
    }
    return url.toString()
  }

  streamUrl(path: string) {
    const url = new URL(this.absoluteUrl(path))
    if (this.session?.token) {
      url.searchParams.set('token', this.session.token)
    }
    return url.toString()
  }

  ebookUrl(itemId: string) {
    return this.streamUrl(`/api/items/${itemId}/ebook`)
  }

  private async request<T>(path: string, init: RequestInit = {}, retries = 2): Promise<T> {
    if (!this.requestBase()) {
      throw new Error('Server URL is not configured.')
    }

    const headers = new Headers(init.headers)
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json')
    }
    if (this.session?.token) {
      headers.set('Authorization', `Bearer ${this.session.token}`)
    }

    let lastError: Error | null = null
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(this.absoluteUrl(path), {
          ...init,
          headers,
        })

        if (!response.ok) {
          const message = await response.text()
          if (response.status === 401) {
            throw new SessionExpiredError('Your Audiobookshelf session is invalid or expired.')
          }
          throw new Error(message || `Audiobookshelf request failed (${response.status})`)
        }

        if (response.status === 204) {
          return null as T
        }

        return response.json() as Promise<T>
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (error instanceof SessionExpiredError || attempt === retries) {
          throw lastError
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
      }
    }

    throw lastError!
  }

  async login(username: string, password: string) {
    const payload = loginSchema.parse(
      await this.request('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    )

    const user = payload.user ?? payload.response?.user
    if (!user) {
      throw new Error('Audiobookshelf login response did not include a user token.')
    }

    return {
      token: user.token,
      user: {
        id: user.id,
        username: user.username,
        type: user.type,
      },
    } satisfies UserSession
  }

  async loginWithToken(token: string) {
    const probe = new AudiobookshelfClient(this.server, {
      token,
      user: {
        id: '',
        username: '',
      },
    })
    const user = await probe.getMe()

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        type: user.type,
      },
    } satisfies UserSession
  }

  async getMe() {
    const response = asRecord(await this.request('/api/me'))
    return {
      id: String(response.id ?? ''),
      username: String(response.username ?? ''),
      type: String(response.type ?? ''),
    }
  }

  async getLibraries() {
    const response = asRecord(await this.request('/api/libraries'))
    const libraries = Array.isArray(response.libraries) ? response.libraries : []
    return libraries.map((library) => {
      const parsed = asRecord(library)
      return {
        id: String(parsed.id ?? ''),
        name: String(parsed.name ?? 'Library'),
        mediaType: String(parsed.mediaType ?? ''),
        audiobooksOnly: Boolean(asRecord(parsed.settings).audiobooksOnly),
      } satisfies Library
    })
  }

  async getPersonalized(libraryId: string) {
    const response = await this.request<unknown>(`/api/libraries/${libraryId}/personalized`)
    const shelves = Array.isArray(response) ? response : []
    return shelves.map((shelf) => {
      const parsed = asRecord(shelf)
      const entities = Array.isArray(parsed.entities)
        ? parsed.entities.filter(isBrowsableBookEntity).map(bookFromUnknown)
        : []
      return {
        id: String(parsed.id ?? ''),
        label: String(parsed.label ?? 'Shelf'),
        entities,
      }
    }).filter((shelf) => shelf.entities.length > 0)
  }

  async getLibraryItems(libraryId: string) {
    const response = asRecord(
      await this.request(`/api/libraries/${libraryId}/items?minified=0&collapseseries=0&sort=media.metadata.title`),
    )
    const results = Array.isArray(response.results) ? response.results : []
    return results.map(bookFromUnknown)
  }

  async getLibraryItemsPaginated(libraryId: string, page: number, limit = 20) {
    const response = asRecord(
      await this.request(
        `/api/libraries/${libraryId}/items?minified=0&collapseseries=0&sort=media.metadata.title&limit=${limit}&page=${page}`,
      ),
    )
    const results = Array.isArray(response.results) ? response.results : []
    const total = Number(response.total ?? 0)
    return { results: results.map(bookFromUnknown), total }
  }

  async getItem(itemId: string) {
    return bookFromUnknown(
      await this.request(`/api/items/${itemId}?expanded=1&include=progress,authors,series`),
    )
  }

  async startPlayback(itemId: string) {
    return playbackFromUnknown(
      await this.request(`/api/items/${itemId}/play`, {
        method: 'POST',
        body: JSON.stringify({
          deviceInfo: {
            deviceId: 'beskar-pwa',
            clientName: 'Beskar Shelf',
            clientVersion: '0.1.0',
            manufacturer: 'Web',
            model: navigator.userAgent,
          },
          forceDirectPlay: true,
          supportedMimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/flac', 'audio/ogg'],
          mediaPlayer: 'html5',
        }),
      }),
    )
  }

  async getBookmarks(itemId: string) {
    const response = asRecord(await this.request(`/api/items/${itemId}?expanded=1&include=progress`))
    const media = asRecord(response.media)
    const bookmarks = Array.isArray(media.bookmarks) ? media.bookmarks : []
    return bookmarks.map((bm): Bookmark => {
      const bookmark = asRecord(bm)
      return {
        title: String(bookmark.title ?? ''),
        time: Number(bookmark.time ?? 0),
        createdAt: Number(bookmark.createdAt ?? 0),
      }
    })
  }

  async createBookmark(itemId: string, time: number, title: string) {
    await this.request(`/api/me/item/${itemId}/bookmark`, {
      method: 'POST',
      body: JSON.stringify({ time, title }),
    })
  }

  async deleteBookmark(itemId: string, time: number) {
    await this.request(`/api/me/item/${itemId}/bookmark/${time}`, {
      method: 'DELETE',
    })
  }

  async updateProgress(itemId: string, payload: ProgressPayload) {
    await this.request(`/api/me/progress/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }
}
