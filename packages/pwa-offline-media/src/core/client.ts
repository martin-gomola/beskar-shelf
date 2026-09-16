import { FetchNetwork } from '../network/fetch.ts'
import type { OfflineNetwork } from '../network/types.ts'
import { snapshotToStoredAsset } from '../storage/types.ts'
import type { OfflineStorage, StoredAsset } from '../storage/types.ts'
import { TransferOperationError, InvalidTransferTransitionError } from './errors.ts'
import {
  recoverAbandonedTransfer,
  transitionSnapshot,
} from './state-machine.ts'
import type {
  OfflineAsset,
  OfflineMediaClient,
  OfflineMediaOptions,
  TransferError,
  TransferEvent,
  TransferResult,
  TransferSnapshot,
  TransferState,
} from './types.ts'

interface ActiveTransfer {
  controller: AbortController
  promise: Promise<TransferResult>
  stopRequested: boolean
}

export class OfflineMediaClientImpl implements OfflineMediaClient {
  private readonly storage: OfflineStorage
  private readonly requestFactory: OfflineMediaOptions['requestFactory']
  private readonly network: OfflineNetwork
  private readonly clock: () => number
  private readonly active = new Map<string, ActiveTransfer>()
  private readonly listeners = new Set<(event: TransferEvent) => void>()

  constructor(options: OfflineMediaOptions & { network?: OfflineNetwork }) {
    this.storage = options.storage
    this.requestFactory = options.requestFactory
    this.network = options.network ?? new FetchNetwork()
    this.clock = options.clock ?? Date.now
  }

  async enqueue(asset: OfflineAsset) {
    const existing = await this.storage.getAsset(asset.id)
    if (existing) {
      await this.storage.putAsset({
        ...existing,
        ...asset,
        updatedAt: this.clock(),
        schemaVersion: existing.schemaVersion,
      })
      return
    }

    const now = this.clock()
    await this.storage.putAsset({
      ...asset,
      state: 'idle',
      persistedBytes: 0,
      completedRanges: [],
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    })
  }

  start(assetId: string) {
    const existing = this.active.get(assetId)
    if (existing) return existing.promise

    const controller = new AbortController()
    const transfer: ActiveTransfer = {
      controller,
      stopRequested: false,
      promise: Promise.resolve(undefined as unknown as TransferResult),
    }
    transfer.promise = this.startTransfer(assetId, transfer)
    this.active.set(assetId, transfer)
    void transfer.promise.then(() => {
      if (this.active.get(assetId) === transfer) this.active.delete(assetId)
    }, () => {
      if (this.active.get(assetId) === transfer) this.active.delete(assetId)
    })
    return transfer.promise
  }

  stop(assetId: string) {
    const transfer = this.active.get(assetId)
    if (!transfer) return
    transfer.stopRequested = true
    transfer.controller.abort()
  }

  async retry(assetId: string) {
    const snapshot = await this.status(assetId)
    if (!snapshot) {
      throw new Error(`Cannot retry unknown asset ${assetId}.`)
    }
    if (!['stopped', 'interrupted', 'failed'].includes(snapshot.state)) {
      if (snapshot.state === 'complete') return this.start(assetId)
      throw new InvalidTransferTransitionError(snapshot.state, 'queued')
    }
    await this.writeState(snapshot, 'queued')
    return this.start(assetId)
  }

  async remove(assetId: string) {
    const transfer = this.active.get(assetId)
    if (transfer) {
      this.stop(assetId)
      await transfer.promise.catch(() => undefined)
    }
    await this.storage.deleteAsset(assetId)
  }

  async status(assetId: string) {
    const asset = await this.storage.getAsset(assetId)
    return asset ? toSnapshot(asset) : undefined
  }

  async list(groupId?: string) {
    const assets = await this.storage.listAssets(groupId)
    return assets.map(toSnapshot)
  }

  async readBlob(assetId: string) {
    const object = await this.storage.getObject(assetId)
    return object ? new Blob([object.data], { type: object.mimeType }) : undefined
  }

  async recoverAbandoned(at = this.clock()) {
    const assets = await this.storage.listAssets()
    let recovered = 0
    for (const asset of assets) {
      const current = toSnapshot(asset)
      const next = recoverAbandonedTransfer(current, at)
      if (next === current) continue
      await this.storage.putAsset(snapshotToStoredAsset(next, asset.schemaVersion))
      this.emit({
        type: 'state',
        assetId: asset.id,
        from: 'downloading',
        to: 'interrupted',
        at,
      })
      recovered++
    }
    return recovered
  }

  subscribe(listener: (event: TransferEvent) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private async startTransfer(assetId: string, transfer: ActiveTransfer): Promise<TransferResult> {
    let snapshot = await this.status(assetId)
    if (!snapshot) throw new Error(`Cannot start unknown asset ${assetId}.`)
    if (snapshot.state === 'complete') return { asset: toAsset(snapshot), snapshot }

    try {
      if (snapshot.state === 'idle' || snapshot.state === 'stopped' || snapshot.state === 'interrupted' || snapshot.state === 'failed') {
        snapshot = await this.writeState(snapshot, 'queued')
      }
      snapshot = await this.writeState(snapshot, 'downloading')

      const request = await this.requestFactory(toAsset(snapshot))
      const response = await this.network.fetch(request, transfer.controller.signal)
      if (!response.ok) {
        throw new TransferOperationError(httpError(response.status), `Download failed with HTTP ${response.status}.`)
      }

      const data = await response.arrayBuffer()
      if (transfer.stopRequested) throw cancellationError()
      await this.storage.putObject({
        assetId,
        data,
        mimeType: response.headers.get('content-type') ?? snapshot.mimeType,
        size: data.byteLength,
      })

      const completed = {
        ...snapshot,
        expectedBytes: snapshot.expectedBytes ?? data.byteLength,
        persistedBytes: data.byteLength,
        completedRanges: [{ start: 0, end: data.byteLength }],
      }
      this.emit({
        type: 'progress',
        assetId,
        receivedBytes: data.byteLength,
        persistedBytes: data.byteLength,
        totalBytes: completed.expectedBytes,
        at: this.clock(),
      })
      snapshot = await this.writeState(completed, 'complete')
      return { asset: toAsset(snapshot), snapshot }
    } catch (error) {
      const isCancellation = transfer.stopRequested || isAbortError(error)
      const current = await this.status(assetId)
      if (current) {
        const terminal = isCancellation ? 'stopped' : 'failed'
        let next = current
        if (current.state === 'downloading') {
          if (isCancellation) next = await this.writeState(current, 'stopping')
          next = await this.writeState(next, terminal)
        }
        if (!isCancellation) {
          const transferError = toTransferError(error)
          await this.storage.putAsset(snapshotToStoredAsset({ ...next, error: transferError }, 1))
          this.emit({ type: 'error', assetId, error: transferError, at: this.clock() })
        }
      }
      if (isCancellation) throw cancellationError()
      throw error
    }
  }

  private async writeState(snapshot: TransferSnapshot, state: TransferState) {
    const next = transitionSnapshot(snapshot, state, this.clock())
    await this.storage.putAsset(snapshotToStoredAsset(next))
    this.emit({
      type: 'state',
      assetId: snapshot.id,
      from: snapshot.state,
      to: state,
      at: next.updatedAt,
    })
    return next
  }

  private emit(event: TransferEvent) {
    for (const listener of this.listeners) listener(event)
  }
}

export function createOfflineMediaClient(options: OfflineMediaOptions & { network?: OfflineNetwork }) {
  return new OfflineMediaClientImpl(options)
}

function toSnapshot(asset: StoredAsset): TransferSnapshot {
  return {
    id: asset.id,
    groupId: asset.groupId,
    filename: asset.filename,
    mimeType: asset.mimeType,
    expectedBytes: asset.expectedBytes,
    metadata: asset.metadata,
    state: asset.state,
    persistedBytes: asset.persistedBytes,
    completedRanges: asset.completedRanges,
    error: asset.error,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  }
}

function toAsset(snapshot: TransferSnapshot): OfflineAsset {
  return {
    id: snapshot.id,
    groupId: snapshot.groupId,
    filename: snapshot.filename,
    mimeType: snapshot.mimeType,
    expectedBytes: snapshot.expectedBytes,
    metadata: snapshot.metadata,
  }
}

function toTransferError(error: unknown): TransferError {
  if (error instanceof TransferOperationError) return error.transferError
  return {
    code: isAbortError(error) ? 'cancellation' : 'network',
    message: error instanceof Error ? error.message : 'Transfer failed.',
    retryable: true,
  }
}

function httpError(status: number): TransferError {
  return { code: 'http', message: `HTTP ${status}`, retryable: status >= 500 }
}

function cancellationError() {
  return new TransferOperationError(
    { code: 'cancellation', message: 'Transfer stopped.', retryable: true },
    'Transfer stopped.',
  )
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}
