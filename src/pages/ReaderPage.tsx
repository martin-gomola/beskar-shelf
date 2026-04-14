import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useClient } from '../contexts/ClientContext'
import { getOfflineBook } from '../lib/storage'
import { formatProgress } from '../lib/utils'

type ReaderTheme = 'light' | 'sepia' | 'dark'

const THEMES: Record<ReaderTheme, { bg: string; fg: string; label: string }> = {
  light: { bg: '#ffffff', fg: '#1a1a1a', label: 'Light' },
  sepia: { bg: '#f5efe4', fg: '#1f1a15', label: 'Sepia' },
  dark:  { bg: '#1a1a1a', fg: '#d4d4d4', label: 'Dark' },
}

const FONT_SIZES = [14, 16, 18, 20, 22, 24]
const DEFAULT_FONT_SIZE = 18

function ReaderPage() {
  const { itemId } = useParams() as { itemId: string }
  const client = useClient()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<InstanceType<typeof import('foliate-js/view.js').View> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [readerProgress, setReaderProgress] = useState(0)
  const [showUI, setShowUI] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [theme, setTheme] = useState<ReaderTheme>('sepia')
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE)
  const [ready, setReady] = useState(false)
  const [pdfSrc, setPdfSrc] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => client.getItem(itemId),
    staleTime: 60 * 1000,
  })
  const item = query.data
  const isPdf = item?.ebookFormat === 'pdf'
  const itemRef = useRef(item)
  itemRef.current = item
  const themeRef = useRef(theme)
  themeRef.current = theme
  const fontSizeRef = useRef(fontSize)
  fontSizeRef.current = fontSize

  const commitReaderProgress = useCallback(async (payload: { cfi: string; progress: number }) => {
    const currentItem = itemRef.current
    if (!currentItem) return
    try {
      localStorage.setItem(`beskar:reader:${currentItem.id}`, payload.cfi)
    } catch { /* quota */ }
    try {
      await client.updateProgress(currentItem.id, {
        duration: currentItem.duration,
        progress: currentItem.progress,
        currentTime: currentItem.currentTime,
        isFinished: currentItem.isFinished,
        ebookLocation: payload.cfi,
        ebookProgress: payload.progress,
        startedAt: Date.now(),
      })
      await queryClient.invalidateQueries({ queryKey: ['item', currentItem.id] })
    } catch {
      // offline — progress queued elsewhere
    }
  }, [client, queryClient])

  const pendingPayloadRef = useRef<{ cfi: string; progress: number } | null>(null)

  const applyTheme = useCallback((t: ReaderTheme, size: number) => {
    const view = viewRef.current
    if (!view?.renderer) return
    const { bg, fg } = THEMES[t]

    const renderer = view.renderer as HTMLElement & { setAttribute(n: string, v: string): void }
    renderer.setAttribute('style', [
      `--light-bg: ${bg}`,
      `--light-fg: ${fg}`,
      `--font-size: ${size}px`,
    ].join('; '))

    const filterPart = view.renderer as unknown as { style?: CSSStyleDeclaration }
    if (filterPart.style) {
      if (t === 'dark') {
        filterPart.style.setProperty('filter', 'invert(1) hue-rotate(180deg)')
      } else {
        filterPart.style.removeProperty('filter')
      }
    }

    for (const content of (view.renderer as unknown as { getContents?(): Array<{ doc: Document }> })?.getContents?.() ?? []) {
      const doc = content.doc
      if (!doc) continue
      let styleEl = doc.getElementById('beskar-reader-style')
      if (!styleEl) {
        styleEl = doc.createElement('style')
        styleEl.id = 'beskar-reader-style'
        doc.head.appendChild(styleEl)
      }
      styleEl.textContent = `
        body {
          background: ${bg} !important;
          color: ${fg} !important;
          font-family: Georgia, "Times New Roman", serif !important;
          font-size: ${size}px !important;
          line-height: 1.75 !important;
        }
      `
    }
  }, [])

  useEffect(() => {
    const isPdfFormat = item?.ebookFormat === 'pdf'
    if (!item || !containerRef.current || !item.ebookFormat || isPdfFormat) return

    let cancelled = false
    const el = containerRef.current

    void (async () => {
      await import('foliate-js/view.js')

      if (cancelled) return

      const view = document.createElement('foliate-view') as InstanceType<typeof import('foliate-js/view.js').View>
      view.style.cssText = 'width: 100%; height: 100%; display: block;'
      el.innerHTML = ''
      el.appendChild(view)
      viewRef.current = view

      const offline = await getOfflineBook(item.id)
      const blob = offline?.status === 'downloaded' && offline.ebookBlob
        ? offline.ebookBlob
        : await client.downloadEbook(item.id)
      if (cancelled) return

      const file = new File([blob], `${item.id}.${item.ebookFormat}`, {
        type: blob.type || 'application/epub+zip',
      })

      await view.open(file)
      if (cancelled) return

      if (view.renderer) {
        view.renderer.setAttribute('flow', 'paginated')
        view.renderer.setAttribute('gap', '5%')
        view.renderer.setAttribute('max-inline-size', '720px')
        view.renderer.setAttribute('max-column-count', '1')
        view.renderer.setAttribute('animated', '')
      }

      view.addEventListener('relocate', ((e: CustomEvent) => {
        const detail = e.detail as { fraction?: number; cfi?: string }
        const progress = detail.fraction ?? 0
        setReaderProgress(progress)
        if (detail.cfi) {
          const payload = { cfi: detail.cfi, progress }
          pendingPayloadRef.current = payload
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => {
            debounceRef.current = null
            pendingPayloadRef.current = null
            void commitReaderProgress(payload)
          }, 3000)
        }
      }) as EventListener)

      view.addEventListener('load', (() => {
        applyTheme(themeRef.current, fontSizeRef.current)
      }) as EventListener)

      const savedCfi = item.ebookLocation || localStorage.getItem(`beskar:reader:${item.id}`) || null
      await view.init({
        lastLocation: savedCfi,
        showTextStart: !savedCfi,
      })

      setReady(true)
    })()

    return () => {
      cancelled = true
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      if (pendingPayloadRef.current) {
        void commitReaderProgress(pendingPayloadRef.current)
        pendingPayloadRef.current = null
      }
      const view = viewRef.current
      if (view) {
        view.close()
        view.remove()
      }
      viewRef.current = null
      setReady(false)
    }
  }, [applyTheme, client, commitReaderProgress, item])

  useEffect(() => {
    if (ready) applyTheme(theme, fontSize)
  }, [theme, fontSize, applyTheme, ready])

  useEffect(() => {
    if (!item || item.ebookFormat !== 'pdf') {
      setPdfSrc(null)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    void (async () => {
      const offline = await getOfflineBook(item.id)
      if (cancelled) return

      if (offline?.status === 'downloaded' && offline.ebookBlob) {
        objectUrl = URL.createObjectURL(offline.ebookBlob)
        setPdfSrc(objectUrl)
        return
      }

      setPdfSrc(client.ebookUrl(item.id))
    })()

    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [client, item])

  const toggleUI = useCallback(() => {
    setShowUI((prev) => {
      if (prev) setShowSettings(false)
      return !prev
    })
  }, [])

  if (query.isPending) {
    return (
      <div className="reader-fullscreen" style={{ background: THEMES[theme].bg }}>
        <p style={{ color: THEMES[theme].fg, textAlign: 'center', paddingTop: '40vh' }}>Loading…</p>
      </div>
    )
  }

  if (query.error || !item || !item.ebookFormat) {
    return (
      <main className="screen">
        <section className="card">
          <h2>Reader unavailable</h2>
          <p className="muted">{(query.error as Error | null)?.message ?? 'This item does not have a readable ebook file.'}</p>
        </section>
      </main>
    )
  }

  const currentTheme = THEMES[theme]
  const progressPct = Math.round((readerProgress || item.ebookProgress) * 100)

  return (
    <div className="reader-fullscreen" style={{ background: currentTheme.bg }}>
      {/* Floating toggle — only visible when chrome is hidden */}
      {!showUI && (
        <button
          className="reader-fab"
          style={{ color: currentTheme.fg }}
          onClick={toggleUI}
          aria-label="Show controls"
        >
          ☰
        </button>
      )}

      {/* Top bar — slides in when showUI is true */}
      <header className={`reader-topbar ${showUI ? 'reader-topbar-visible' : ''}`}>
        <button className="reader-back-btn" onClick={() => navigate(`/book/${item.id}`, { replace: true })}>
          ←
        </button>
        <div className="reader-topbar-title">
          <strong>{item.title}</strong>
        </div>
        <button className="reader-settings-btn" onClick={() => setShowSettings(!showSettings)}>
          Aa
        </button>
        <button className="reader-close-btn" onClick={toggleUI} aria-label="Hide controls">
          ✕
        </button>
      </header>

      {/* Reading area */}
      {isPdf ? (
        <iframe
          className="reader-content-frame"
          src={pdfSrc ?? client.ebookUrl(item.id)}
          title={item.title}
          style={{ background: currentTheme.bg }}
        />
      ) : (
        <div className="reader-content">
          <div ref={containerRef} className="reader-epub-container" />
          {/* Tap zones overlay — sit above the shadow DOM */}
          <div
            className="reader-tap-zone reader-tap-prev"
            onClick={() => viewRef.current?.prev()}
            aria-label="Previous page"
          />
          <div
            className="reader-tap-zone reader-tap-next"
            onClick={() => viewRef.current?.next()}
            aria-label="Next page"
          />
        </div>
      )}

      {/* Bottom bar — progress */}
      <footer className={`reader-bottombar ${showUI ? 'reader-bottombar-visible' : ''}`}>
        <div className="reader-progress-track">
          <div className="reader-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="reader-progress-label">
          <span>{formatProgress(readerProgress || item.ebookProgress)}</span>
          <span>{item.ebookFormat.toUpperCase()}</span>
        </div>
      </footer>

      {/* Settings panel */}
      {showSettings && (
        <div className="reader-settings-panel">
          <div className="reader-settings-row">
            <span>Size</span>
            <div className="reader-font-controls">
              <button
                className="icon-button"
                disabled={fontSize <= FONT_SIZES[0]}
                onClick={() => setFontSize((s) => Math.max(FONT_SIZES[0], s - 2))}
              >
                A−
              </button>
              <span>{fontSize}px</span>
              <button
                className="icon-button"
                disabled={fontSize >= FONT_SIZES[FONT_SIZES.length - 1]}
                onClick={() => setFontSize((s) => Math.min(FONT_SIZES[FONT_SIZES.length - 1], s + 2))}
              >
                A+
              </button>
            </div>
          </div>
          <div className="reader-settings-row">
            <span>Theme</span>
            <div className="reader-theme-buttons">
              {(Object.keys(THEMES) as ReaderTheme[]).map((key) => (
                <button
                  key={key}
                  className={`reader-theme-swatch ${theme === key ? 'active' : ''}`}
                  style={{ background: THEMES[key].bg, color: THEMES[key].fg }}
                  onClick={() => setTheme(key)}
                >
                  {THEMES[key].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReaderPage
