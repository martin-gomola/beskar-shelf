import type { RuntimeRequest } from '../core/types.ts'
import type { OfflineNetwork, OfflineNetworkResponse } from './types.ts'

export class FetchNetwork implements OfflineNetwork {
  async fetch(request: RuntimeRequest, signal?: AbortSignal): Promise<OfflineNetworkResponse> {
    return globalThis.fetch(request.url, {
      headers: request.headers,
      signal,
    })
  }
}
