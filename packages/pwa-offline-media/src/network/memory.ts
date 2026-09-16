import type { RuntimeRequest } from '../core/types.ts'
import type { OfflineNetwork, OfflineNetworkResponse } from './types.ts'

export interface MemoryNetworkResponseInit {
  body?: ArrayBuffer | ArrayBufferView | string
  status?: number
  headers?: HeadersInit
}

export type MemoryNetworkHandler = (
  request: RuntimeRequest,
  signal?: AbortSignal,
) => MemoryNetworkResponseInit | Promise<MemoryNetworkResponseInit>

export class MemoryNetwork implements OfflineNetwork {
  readonly requests: RuntimeRequest[] = []
  private readonly handler: MemoryNetworkHandler

  constructor(handler: MemoryNetworkHandler) {
    this.handler = handler
  }

  async fetch(request: RuntimeRequest, signal?: AbortSignal) {
    if (signal?.aborted) {
      throw abortError()
    }

    this.requests.push({ ...request })
    const response = await this.handler(request, signal)
    if (signal?.aborted) {
      throw abortError()
    }

    const body = toArrayBuffer(response.body)
    const status = response.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(response.headers),
      arrayBuffer: async () => body.slice(0),
    } satisfies OfflineNetworkResponse
  }
}

function toArrayBuffer(body: MemoryNetworkResponseInit['body'] = new ArrayBuffer(0)) {
  if (typeof body === 'string') {
    return new TextEncoder().encode(body).buffer
  }
  if (body instanceof ArrayBuffer) {
    return body.slice(0)
  }
  return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
}

function abortError() {
  const error = new Error('The network request was aborted.')
  error.name = 'AbortError'
  return error
}
