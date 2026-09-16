export interface TimelineTrack {
  startOffset: number
  duration: number
}

export function trackForTime(tracks: TimelineTrack[], currentTime: number) {
  if (tracks.length === 0) return 0
  const target = Math.max(0, currentTime)
  const found = tracks.findIndex((track) => (
    target >= track.startOffset && target < track.startOffset + track.duration
  ))
  return found === -1 ? tracks.length - 1 : found
}

export function totalTimeFromTrack(
  tracks: TimelineTrack[],
  trackIndex: number,
  audioTime: number,
) {
  return (tracks[trackIndex]?.startOffset ?? 0) + audioTime
}

export function revokeObjectUrls(sources: string[], revoke = URL.revokeObjectURL) {
  sources.forEach((source) => {
    if (source.startsWith('blob:')) revoke(source)
  })
}
