import type { OfflineBook } from './types'

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00'
  }

  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remaining = total % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`
  }

  return `${minutes}:${remaining.toString().padStart(2, '0')}`
}

export function formatProgress(progress: number) {
  return `${Math.round(progress * 100)}%`
}

export function normalizeBaseUrl(input: string) {
  return input.trim().replace(/\/+$/, '')
}

export function sumDurations(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function getOfflineBookBytes(book: Pick<OfflineBook, 'tracks' | 'ebookBlob' | 'totalBytes'>) {
  const trackBytes = book.tracks.reduce((total, track) => total + track.blob.size, 0)
  const ebookBytes = book.ebookBlob?.size ?? 0
  const derivedBytes = trackBytes + ebookBytes

  return derivedBytes > 0 ? derivedBytes : book.totalBytes
}
