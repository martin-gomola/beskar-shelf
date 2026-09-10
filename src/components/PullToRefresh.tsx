import { useCallback, useEffect, useRef, useState } from 'react'

const TRIGGER_DISTANCE = 72
const MAX_DISTANCE = 96

interface PullToRefreshProps {
  disabled?: boolean
  onRefresh: () => Promise<void>
}

export function PullToRefresh({ disabled = false, onRefresh }: PullToRefreshProps) {
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const distanceRef = useRef(0)
  const disabledRef = useRef(disabled)
  const refreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    disabledRef.current = disabled
    onRefreshRef.current = onRefresh
  }, [disabled, onRefresh])

  useEffect(() => {
    refreshingRef.current = refreshing
  }, [refreshing])

  const resetPull = useCallback(() => {
    startRef.current = null
    distanceRef.current = 0
    setDistance(0)
  }, [])

  useEffect(() => {
    function setPullDistance(value: number) {
      distanceRef.current = value
      setDistance(value)
    }

    function handleTouchStart(event: TouchEvent) {
      if (disabledRef.current || refreshingRef.current || window.scrollY > 0 || event.touches.length !== 1) {
        startRef.current = null
        return
      }

      startRef.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      }
    }

    function handleTouchMove(event: TouchEvent) {
      if (!startRef.current || disabledRef.current || refreshingRef.current || event.touches.length !== 1) {
        return
      }

      const deltaX = event.touches[0].clientX - startRef.current.x
      const deltaY = event.touches[0].clientY - startRef.current.y
      if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
        resetPull()
        return
      }

      if (window.scrollY > 0) {
        resetPull()
        return
      }

      if (event.cancelable) {
        event.preventDefault()
      }

      const nextDistance = Math.min(MAX_DISTANCE, deltaY * 0.55)
      setPullDistance(nextDistance)
      setAnnouncement(nextDistance >= TRIGGER_DISTANCE ? 'Release to refresh.' : 'Keep pulling to refresh.')
    }

    async function handleTouchEnd() {
      if (distanceRef.current < TRIGGER_DISTANCE || disabledRef.current || refreshingRef.current) {
        if (distanceRef.current > 0) setAnnouncement('Refresh cancelled.')
        resetPull()
        return
      }

      setPullDistance(TRIGGER_DISTANCE)
      setRefreshing(true)
      setAnnouncement('Refreshing…')
      startRef.current = null
      try {
        await onRefreshRef.current()
      } finally {
        setRefreshing(false)
        setAnnouncement('Refresh complete.')
        resetPull()
      }
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd)
    window.addEventListener('touchcancel', resetPull)

    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', resetPull)
    }
  }, [resetPull])

  const progress = refreshing ? 1 : Math.min(1, distance / TRIGGER_DISTANCE)
  const visible = distance > 0 || refreshing

  return (
    <div className="pull-refresh-layer">
      <div
        className="pull-refresh-indicator"
        data-visible={visible}
        data-refreshing={refreshing}
        style={{
          opacity: visible ? 1 : 0,
          transform: `translate(-50%, ${visible ? Math.max(8, distance - 44) : -32}px) scale(${0.75 + progress * 0.25})`,
        }}
        aria-hidden="true"
      >
        <span />
      </div>
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    </div>
  )
}
