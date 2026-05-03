import { useCallback, useEffect, useRef, useState } from 'react'

const TRIGGER_DISTANCE = 72
const MAX_DISTANCE = 96

interface PullToRefreshProps {
  disabled?: boolean
  onRefresh: () => Promise<void>
}

export function PullToRefresh({ disabled = false, onRefresh }: PullToRefreshProps) {
  const startYRef = useRef<number | null>(null)
  const distanceRef = useRef(0)
  const disabledRef = useRef(disabled)
  const refreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    disabledRef.current = disabled
    onRefreshRef.current = onRefresh
  }, [disabled, onRefresh])

  useEffect(() => {
    refreshingRef.current = refreshing
  }, [refreshing])

  const resetPull = useCallback(() => {
    startYRef.current = null
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
        startYRef.current = null
        return
      }

      startYRef.current = event.touches[0].clientY
    }

    function handleTouchMove(event: TouchEvent) {
      if (startYRef.current === null || disabledRef.current || refreshingRef.current || event.touches.length !== 1) {
        return
      }

      const pullDistance = event.touches[0].clientY - startYRef.current
      if (pullDistance <= 0) {
        setPullDistance(0)
        return
      }

      if (window.scrollY > 0) {
        resetPull()
        return
      }

      if (event.cancelable) {
        event.preventDefault()
      }

      setPullDistance(Math.min(MAX_DISTANCE, pullDistance * 0.55))
    }

    async function handleTouchEnd() {
      if (distanceRef.current < TRIGGER_DISTANCE || disabledRef.current || refreshingRef.current) {
        resetPull()
        return
      }

      setPullDistance(TRIGGER_DISTANCE)
      setRefreshing(true)
      startYRef.current = null
      try {
        await onRefreshRef.current()
      } finally {
        setRefreshing(false)
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
    </div>
  )
}
