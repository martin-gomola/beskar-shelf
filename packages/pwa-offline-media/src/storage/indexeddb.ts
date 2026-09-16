import { openDB, type IDBPDatabase } from 'idb'

import type { StoredAsset, StoredChunk, StoredObject, OfflineStorage } from './types.ts'

export interface IndexedDbMigrationResult {
  assets?: StoredAsset[]
  objects?: StoredObject[]
}

export interface IndexedDbMigration {
  id: string
  migrate: (db: IDBPDatabase) => Promise<IndexedDbMigrationResult>
}

export interface IndexedDbOfflineStorageOptions {
  databaseName?: string
  version?: number
  assetStoreName?: string
  chunkStoreName?: string
  objectStoreName?: string
  migrationStoreName?: string
  migration?: IndexedDbMigration
}

interface MigrationRecord {
  id: string
  completedAt: number
}

export class IndexedDbOfflineStorage implements OfflineStorage {
  private readonly databaseName: string
  private readonly version: number
  private readonly assetStoreName: string
  private readonly chunkStoreName: string
  private readonly objectStoreName: string
  private readonly migrationStoreName: string
  private readonly migration?: IndexedDbMigration
  private readonly databasePromise: Promise<IDBPDatabase>

  constructor(options: IndexedDbOfflineStorageOptions = {}) {
    this.databaseName = options.databaseName ?? 'pwa-offline-media'
    this.version = options.version ?? 1
    this.assetStoreName = options.assetStoreName ?? 'assets'
    this.chunkStoreName = options.chunkStoreName ?? 'chunks'
    this.objectStoreName = options.objectStoreName ?? 'objects'
    this.migrationStoreName = options.migrationStoreName ?? 'migrations'
    this.migration = options.migration
    this.databasePromise = this.open()
  }

  async getAsset(assetId: string) {
    const db = await this.databasePromise
    const asset = await db.get(this.assetStoreName, assetId) as StoredAsset | undefined
    return asset ? copyAsset(asset) : undefined
  }

  async listAssets(groupId?: string) {
    const db = await this.databasePromise
    const assets = await db.getAll(this.assetStoreName) as StoredAsset[]
    return assets
      .filter((asset) => groupId === undefined || asset.groupId === groupId)
      .map(copyAsset)
  }

  async putAsset(asset: StoredAsset) {
    const db = await this.databasePromise
    await db.put(this.assetStoreName, copyAsset(asset))
  }

  async deleteAsset(assetId: string) {
    const db = await this.databasePromise
    await this.deleteChunksForAsset(db, assetId)
    const tx = db.transaction([this.assetStoreName, this.objectStoreName], 'readwrite')
    await Promise.all([
      tx.objectStore(this.assetStoreName).delete(assetId),
      tx.objectStore(this.objectStoreName).delete(assetId),
    ])
    await tx.done
  }

  async getChunk(assetId: string, start: number) {
    const db = await this.databasePromise
    const chunk = await db.get(this.chunkStoreName, [assetId, start]) as StoredChunk | undefined
    return chunk ? copyChunk(chunk) : undefined
  }

  async listChunks(assetId: string) {
    const db = await this.databasePromise
    const chunks = await db.getAll(this.chunkStoreName) as StoredChunk[]
    return chunks.filter((chunk) => chunk.assetId === assetId).map(copyChunk)
  }

  async putChunk(chunk: StoredChunk) {
    const db = await this.databasePromise
    await db.put(this.chunkStoreName, copyChunk(chunk))
  }

  async deleteChunks(assetId: string) {
    const db = await this.databasePromise
    await this.deleteChunksForAsset(db, assetId)
  }

  async getObject(assetId: string) {
    const db = await this.databasePromise
    const object = await db.get(this.objectStoreName, assetId) as StoredObject | undefined
    return object ? copyObject(object) : undefined
  }

  async putObject(object: StoredObject) {
    const db = await this.databasePromise
    await db.put(this.objectStoreName, copyObject(object))
  }

  async deleteObject(assetId: string) {
    const db = await this.databasePromise
    await db.delete(this.objectStoreName, assetId)
  }

  private async open() {
    const db = await openDB(this.databaseName, this.version, {
      upgrade: (database) => {
        if (!database.objectStoreNames.contains(this.assetStoreName)) {
          database.createObjectStore(this.assetStoreName, { keyPath: 'id' })
        }
        if (!database.objectStoreNames.contains(this.chunkStoreName)) {
          database.createObjectStore(this.chunkStoreName, { keyPath: ['assetId', 'start'] })
        }
        if (!database.objectStoreNames.contains(this.objectStoreName)) {
          database.createObjectStore(this.objectStoreName, { keyPath: 'assetId' })
        }
        if (!database.objectStoreNames.contains(this.migrationStoreName)) {
          database.createObjectStore(this.migrationStoreName, { keyPath: 'id' })
        }
      },
    })

    await this.runMigration(db)
    return db
  }

  private async runMigration(db: IDBPDatabase) {
    if (!this.migration) return

    const marker = await db.get(this.migrationStoreName, this.migration.id) as MigrationRecord | undefined
    if (marker) return

    const result = await this.migration.migrate(db)
    const tx = db.transaction(
      [this.assetStoreName, this.objectStoreName, this.migrationStoreName],
      'readwrite',
    )
    await Promise.all([
      ...(result.assets ?? []).map((asset) => tx.objectStore(this.assetStoreName).put(copyAsset(asset))),
      ...(result.objects ?? []).map((object) => tx.objectStore(this.objectStoreName).put(copyObject(object))),
      tx.objectStore(this.migrationStoreName).put({
        id: this.migration.id,
        completedAt: Date.now(),
      } satisfies MigrationRecord),
    ])
    await tx.done
  }

  private async deleteChunksForAsset(db: IDBPDatabase, assetId: string) {
    const tx = db.transaction(this.chunkStoreName, 'readwrite')
    let cursor = await tx.store.openCursor()
    while (cursor) {
      if ((cursor.value as StoredChunk).assetId === assetId) {
        await cursor.delete()
      }
      cursor = await cursor.continue()
    }
    await tx.done
  }
}

function copyAsset(asset: StoredAsset): StoredAsset {
  return {
    ...asset,
    completedRanges: asset.completedRanges.map((range) => ({ ...range })),
    error: asset.error ? { ...asset.error } : undefined,
    metadata: asset.metadata ? { ...asset.metadata } : undefined,
  }
}

function copyChunk(chunk: StoredChunk): StoredChunk {
  return { ...chunk, data: chunk.data.slice(0) }
}

function copyObject(object: StoredObject): StoredObject {
  return { ...object, data: object.data.slice(0) }
}
