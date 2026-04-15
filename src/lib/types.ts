export interface ServerConfig {
  baseUrl: string
  mode: 'direct' | 'proxy'
}

export interface UserSession {
  token: string
  user: {
    id: string
    username: string
    type?: string
  }
}

export interface Library {
  id: string
  name: string
  mediaType: string
  audiobooksOnly?: boolean
}

export interface Chapter {
  id: number | string
  title: string
  start: number
  end: number
}

export interface AudioTrack {
  index: number
  duration: number
  startOffset: number
  contentUrl: string
  mimeType: string
  title: string
}

export interface BookItem {
  id: string
  libraryId: string
  title: string
  author: string
  narrator: string | null
  description: string
  coverPath: string | null
  duration: number
  size: number
  genres: string[]
  progress: number
  currentTime: number
  isFinished: boolean
  chapters: Chapter[]
  audioTracks: AudioTrack[]
  ebookFormat: string | null
  ebookLocation: string | null
  ebookProgress: number
}

export interface PlaybackSession {
  id: string
  libraryItemId: string
  duration: number
  displayTitle: string
  displayAuthor: string
  coverPath: string | null
  chapters: Chapter[]
  audioTracks: AudioTrack[]
}

export interface PersistedPlaybackState {
  itemId: string
  sessionId: string
  currentTime: number
  duration: number
  rate: number
  updatedAt: number
}

export interface Bookmark {
  title: string
  time: number
  createdAt: number
}

export interface OfflineTrack {
  trackIndex: number
  title: string
  duration: number
  mimeType: string
  blob: Blob
}

export interface DownloadBookOptions {
  selectedTrackIndices?: number[]
}

export interface OfflineBook {
  itemId: string
  title: string
  author: string
  coverPath: string | null
  status: 'idle' | 'downloading' | 'downloaded' | 'error'
  totalBytes: number
  updatedAt: number
  tracks: OfflineTrack[]
  ebookBlob?: Blob | null
  ebookFormat?: string | null
}

export interface ProgressPayload {
  duration: number
  progress: number
  currentTime: number
  isFinished: boolean
  finishedAt?: number | null
  startedAt?: number
  ebookLocation?: string | null
  ebookProgress?: number
}
