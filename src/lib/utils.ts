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

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
