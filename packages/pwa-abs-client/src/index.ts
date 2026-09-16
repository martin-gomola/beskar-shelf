export interface AudiobookshelfServer {
  baseUrl: string
  mode: 'direct' | 'proxy' | 'dynamic-proxy'
}

export interface AudiobookshelfSession {
  token: string
}

export interface AudiobookshelfClientPort {
  hasServer(): boolean
  hasSession(): boolean
  absoluteUrl(path: string): string
  coverUrl(itemId: string): string
  streamUrl(path: string): string
  ebookUrl(itemId: string): string
  socketIoUrl(token: string): string
}

export interface AudiobookshelfClientBaseOptions {
  proxyBase?: string
  dynamicProxyEnabled?: boolean
}

export class AudiobookshelfClientBase implements AudiobookshelfClientPort {
  protected readonly baseUrl: string
  protected readonly session: AudiobookshelfSession | null
  protected readonly server: AudiobookshelfServer | null
  private readonly proxyBase: string
  private readonly dynamicProxyEnabled: boolean

  constructor(
    server: AudiobookshelfServer | null,
    session: AudiobookshelfSession | null,
    options: AudiobookshelfClientBaseOptions = {},
  ) {
    this.server = server
    this.session = session
    this.baseUrl = (server?.baseUrl ?? '').trim().replace(/\/+$/, '')
    this.proxyBase = (options.proxyBase ?? '').trim().replace(/\/+$/, '')
    this.dynamicProxyEnabled = options.dynamicProxyEnabled ?? false
  }

  hasServer() {
    return Boolean(this.baseUrl)
  }

  hasSession() {
    return Boolean(this.session?.token)
  }

  protected requestBase() {
    const origin = globalThis.location?.origin ?? ''
    if (this.server?.mode === 'proxy' && this.proxyBase) {
      return `${origin}${this.proxyBase}`
    }
    if (this.server?.mode === 'dynamic-proxy' && this.dynamicProxyEnabled) {
      return `${origin}/proxy/${this.baseUrl}`
    }
    if (this.server?.mode === 'dynamic-proxy' && this.proxyBase) {
      return `${origin}${this.proxyBase}`
    }
    return this.baseUrl
  }

  absoluteUrl(path: string) {
    if (/^https?:\/\//.test(path)) return path
    const base = this.requestBase()
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`
  }

  coverUrl(itemId: string) {
    return this.assetUrl(`/api/items/${itemId}/cover`)!
  }

  assetUrl(path: string | null) {
    if (!path) return null
    const url = new URL(this.absoluteUrl(path))
    if (this.session?.token) url.searchParams.set('token', this.session.token)
    return url.toString()
  }

  streamUrl(path: string) {
    return this.assetUrl(path)!
  }

  socketIoUrl(token: string) {
    const httpUrl = new URL(this.absoluteUrl('/socket.io/'))
    httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    httpUrl.searchParams.set('EIO', '4')
    httpUrl.searchParams.set('transport', 'websocket')
    httpUrl.searchParams.set('token', token)
    return httpUrl.toString()
  }

  ebookUrl(itemId: string) {
    return this.streamUrl(`/api/items/${itemId}/ebook`)
  }
}

export class AudiobookshelfSessionExpiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AudiobookshelfSessionExpiredError'
  }
}
