import type { OfflineStorage, StoredAsset, StoredChunk, StoredObject } from './types.ts'
import { copyStoredAsset, copyStoredChunk } from './types.ts'

export type MemoryStorageOperation =
  | 'getAsset'
  | 'listAssets'
  | 'putAsset'
  | 'deleteAsset'
  | 'getChunk'
  | 'listChunks'
  | 'putChunk'
  | 'deleteChunks'
  | 'getObject'
  | 'putObject'
  | 'deleteObject'

export interface MemoryStorageOptions {
  beforeOperation?: (operation: MemoryStorageOperation) => void
}

export class MemoryOfflineStorage implements OfflineStorage {
  readonly operations: MemoryStorageOperation[] = []
  private readonly assets = new Map<string, StoredAsset>()
  private readonly chunks = new Map<string, Map<number, StoredChunk>>()
  private readonly objects = new Map<string, StoredObject>()
  private readonly beforeOperation?: (operation: MemoryStorageOperation) => void

  constructor(options: MemoryStorageOptions = {}) {
    this.beforeOperation = options.beforeOperation
  }

  async getAsset(assetId: string) {
    this.record('getAsset')
    return this.assets.has(assetId) ? copyStoredAsset(this.assets.get(assetId)!) : undefined
  }

  async listAssets(groupId?: string) {
    this.record('listAssets')
    return Array.from(this.assets.values())
      .filter((asset) => groupId === undefined || asset.groupId === groupId)
      .map(copyStoredAsset)
  }

  async putAsset(asset: StoredAsset) {
    this.record('putAsset')
    this.assets.set(asset.id, copyStoredAsset(asset))
  }

  async deleteAsset(assetId: string) {
    this.record('deleteAsset')
    this.assets.delete(assetId)
    this.chunks.delete(assetId)
    this.objects.delete(assetId)
  }

  async getChunk(assetId: string, start: number) {
    this.record('getChunk')
    const chunk = this.chunks.get(assetId)?.get(start)
    return chunk ? copyStoredChunk(chunk) : undefined
  }

  async listChunks(assetId: string) {
    this.record('listChunks')
    return Array.from(this.chunks.get(assetId)?.values() ?? [], copyStoredChunk)
  }

  async putChunk(chunk: StoredChunk) {
    this.record('putChunk')
    const assetChunks = this.chunks.get(chunk.assetId) ?? new Map<number, StoredChunk>()
    assetChunks.set(chunk.start, copyStoredChunk(chunk))
    this.chunks.set(chunk.assetId, assetChunks)
  }

  async deleteChunks(assetId: string) {
    this.record('deleteChunks')
    this.chunks.delete(assetId)
  }

  async getObject(assetId: string) {
    this.record('getObject')
    const object = this.objects.get(assetId)
    return object ? { ...object, data: object.data.slice(0) } : undefined
  }

  async putObject(object: StoredObject) {
    this.record('putObject')
    this.objects.set(object.assetId, { ...object, data: object.data.slice(0) })
  }

  async deleteObject(assetId: string) {
    this.record('deleteObject')
    this.objects.delete(assetId)
  }

  private record(operation: MemoryStorageOperation) {
    this.operations.push(operation)
    this.beforeOperation?.(operation)
  }
}
