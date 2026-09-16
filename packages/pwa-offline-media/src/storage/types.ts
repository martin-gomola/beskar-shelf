import type { CompletedRange, TransferSnapshot } from '../core/types.ts'

export interface StoredAsset extends TransferSnapshot {
  schemaVersion: number
  etag?: string
  lastModified?: string
}

export interface StoredChunk {
  assetId: string
  start: number
  end: number
  data: ArrayBuffer
  checksum?: string
}

export interface StoredObject {
  assetId: string
  data: ArrayBuffer
  mimeType?: string
  size: number
}

export interface OfflineStorage {
  getAsset(assetId: string): Promise<StoredAsset | undefined>
  listAssets(groupId?: string): Promise<StoredAsset[]>
  putAsset(asset: StoredAsset): Promise<void>
  deleteAsset(assetId: string): Promise<void>
  getChunk(assetId: string, start: number): Promise<StoredChunk | undefined>
  listChunks(assetId: string): Promise<StoredChunk[]>
  putChunk(chunk: StoredChunk): Promise<void>
  deleteChunks(assetId: string): Promise<void>
  getObject(assetId: string): Promise<StoredObject | undefined>
  putObject(object: StoredObject): Promise<void>
  deleteObject(assetId: string): Promise<void>
}

export function snapshotToStoredAsset(snapshot: TransferSnapshot, schemaVersion = 1): StoredAsset {
  return {
    ...snapshot,
    completedRanges: snapshot.completedRanges.map(copyRange),
    error: snapshot.error ? { ...snapshot.error } : undefined,
    metadata: snapshot.metadata ? { ...snapshot.metadata } : undefined,
    schemaVersion,
  }
}

function copyRange(range: CompletedRange) {
  return { start: range.start, end: range.end }
}

export function copyStoredAsset(asset: StoredAsset): StoredAsset {
  return snapshotToStoredAsset(asset, asset.schemaVersion)
}

export function copyStoredChunk(chunk: StoredChunk): StoredChunk {
  return {
    ...chunk,
    data: chunk.data.slice(0),
  }
}
