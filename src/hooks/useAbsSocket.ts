import { useEffect, useRef } from 'react'
import type { QueryClient } from '@tanstack/react-query'

import type { AudiobookshelfClient } from '../lib/api'
import type { UserSession } from '../lib/types'

// Minimal socket.io v4 wire protocol over native WebSocket.
// ABS emits: 'item_updated', 'user_media_progress_updated', 'items_updated'
// Packet types we care about: 0=OPEN 40=CONNECT 42=EVENT

function parseSocketIoPacket(raw: string): { type: string; data: unknown[] } | null {
  // Socket.io v4 frames: "42[\"event\", payload]"
  const match = raw.match(/^(\d+)(.*)$/)
  if (!match) return null
  const code = match[1]
  const body = match[2]
  if (code !== '42' || !body) return null
  try {
    const parsed = JSON.parse(body)
    if (!Array.isArray(parsed) || parsed.length < 1) return null
    return { type: String(parsed[0]), data: parsed.slice(1) }
  } catch {
    return null
  }
}

function absSocketUrl(client: AudiobookshelfClient, token: string): string {
  // Build ws(s)://<host>/socket.io/?EIO=4&transport=websocket&token=<token>
  const coverUrl = client.coverUrl('probe')
  const parsed = new URL(coverUrl)
  const wsScheme = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsScheme}//${parsed.host}/socket.io/?EIO=4&transport=websocket&token=${encodeURIComponent(token)}`
}

export function useAbsSocket(
  client: AudiobookshelfClient,
  session: UserSession | null,
  queryClient: QueryClient,
) {
  const wsRef = useRef<WebSocket | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!session?.token || !client.hasServer()) return
    const token = session.token

    let destroyed = false

    function cleanup() {
      destroyed = true
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null }
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null }
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }

    function connect() {
      if (destroyed) return
      try {
        const url = absSocketUrl(client, token)
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onmessage = (event) => {
          const raw = String(event.data)

          // socket.io OPEN — respond with CONNECT packet
          if (raw.startsWith('0')) {
            ws.send('40')
            // Start ping interval (socket.io v4 default: 25s)
            if (pingRef.current) clearInterval(pingRef.current)
            pingRef.current = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) ws.send('3')
            }, 25_000)
            return
          }

          const packet = parseSocketIoPacket(raw)
          if (!packet) return

          if (packet.type === 'item_updated' || packet.type === 'items_updated') {
            const items = packet.type === 'items_updated' ? packet.data[0] : [packet.data[0]]
            if (!Array.isArray(items)) return
            for (const item of items) {
              if (!item || typeof item !== 'object') continue
              const id = String((item as Record<string, unknown>).id ?? '')
              if (!id) continue
              queryClient.setQueryData(['item', id], (old: unknown) => {
                if (!old || typeof old !== 'object') return old
                return { ...(old as Record<string, unknown>), ...(item as Record<string, unknown>) }
              })
            }
            void queryClient.invalidateQueries({ queryKey: ['personalized'], exact: false })
          }

          if (packet.type === 'user_media_progress_updated') {
            const payload = packet.data[0] as Record<string, unknown> | undefined
            if (!payload) return
            const id = String(payload.libraryItemId ?? '')
            if (!id) return
            queryClient.setQueryData(['item', id], (old: unknown) => {
              if (!old || typeof old !== 'object') return old
              return {
                ...(old as Record<string, unknown>),
                currentTime: payload.currentTime,
                progress: payload.progress,
                isFinished: payload.isFinished,
              }
            })
          }
        }

        ws.onclose = () => {
          if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null }
          if (!destroyed) {
            // Reconnect after 5s on unexpected close
            reconnectRef.current = setTimeout(connect, 5_000)
          }
        }

        ws.onerror = () => {
          ws.close()
        }
      } catch {
        if (!destroyed) {
          reconnectRef.current = setTimeout(connect, 5_000)
        }
      }
    }

    connect()
    return cleanup
  }, [client, queryClient, session])
}
