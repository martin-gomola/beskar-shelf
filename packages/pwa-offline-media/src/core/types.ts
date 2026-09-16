export type TransferState =
  | 'idle'
  | 'queued'
  | 'downloading'
  | 'stopping'
  | 'stopped'
  | 'interrupted'
  | 'failed'
  | 'complete'

export type TransferErrorCode =
  | 'cancellation'
  | 'network'
  | 'http'
  | 'integrity'
  | 'quota'
  | 'storage'
  | 'unsupported-range'
  | 'unknown'

export interface TransferError {
  code: TransferErrorCode
  message: string
  retryable: boolean
}

export interface OfflineAsset {
  id: string
  groupId?: string
  filename?: string
  mimeType?: string
  expectedBytes?: number
  metadata?: Record<string, unknown>
}

export interface RuntimeRequest {
  url: string
  headers?: HeadersInit
}

export interface CompletedRange {
  start: number
  end: number
}

export interface TransferSnapshot extends OfflineAsset {
  state: TransferState
  persistedBytes: number
  completedRanges: CompletedRange[]
  error?: TransferError
  createdAt: number
  updatedAt: number
}

export interface TransferResult {
  asset: OfflineAsset
  snapshot: TransferSnapshot
}

export type TransferEvent =
  | {
      type: 'state'
      assetId: string
      from: TransferState
      to: TransferState
      at: number
    }
  | {
      type: 'progress'
      assetId: string
      receivedBytes: number
      persistedBytes: number
      totalBytes?: number
      at: number
    }
  | {
      type: 'error'
      assetId: string
      error: TransferError
      at: number
    }

export interface OfflineMediaClient {
  enqueue(asset: OfflineAsset): Promise<void>
  start(assetId: string): Promise<TransferResult>
  stop(assetId: string): void
  retry(assetId: string): Promise<TransferResult>
  remove(assetId: string): Promise<void>
  status(assetId: string): Promise<TransferSnapshot | undefined>
  list(groupId?: string): Promise<TransferSnapshot[]>
  readBlob(assetId: string): Promise<Blob | undefined>
  recoverAbandoned(at?: number): Promise<number>
  subscribe(listener: (event: TransferEvent) => void): () => void
}

export interface OfflineMediaOptions {
  namespace: string
  storage: import('../storage/types.ts').OfflineStorage
  requestFactory: (asset: OfflineAsset) => Promise<RuntimeRequest>
  chunkBytes?: number
  concurrency?: number
  clock?: () => number
}
