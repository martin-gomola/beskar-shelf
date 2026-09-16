import type { RuntimeRequest } from '../core/types.ts'

export interface OfflineNetworkResponse {
  ok: boolean
  status: number
  headers: Headers
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface OfflineNetwork {
  fetch(request: RuntimeRequest, signal?: AbortSignal): Promise<OfflineNetworkResponse>
}
