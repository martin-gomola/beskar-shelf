import { describe, expect, it } from 'vitest'

import {
  TransferOperationError,
  createOfflineMediaClient,
} from '../src/index.ts'
import { MemoryNetwork, MemoryOfflineStorage } from '../src/testing/index.ts'
import type { OfflineAsset, StoredAsset } from '../src/index.ts'

const asset: OfflineAsset = {
  id: 'track-1',
  groupId: 'book-1',
  mimeType: 'audio/mpeg',
  metadata: { kind: 'track', trackIndex: 0 },
}

describe('offline media client', () => {
  it('persists one complete asset as bytes and reconstructs it on demand', async () => {
    const storage = new MemoryOfflineStorage()
    const network = new MemoryNetwork(() => ({
      body: new Uint8Array([1, 2, 3]),
      headers: { 'content-type': 'audio/mpeg' },
    }))
    const client = createOfflineMediaClient({
      namespace: 'test',
      storage,
      network,
      requestFactory: async () => ({ url: 'https://example.test/track' }),
      clock: () => 100,
    })

    await client.enqueue(asset)
    const result = await client.start(asset.id)
    const stored = await storage.getObject(asset.id)
    const blob = await client.readBlob(asset.id)

    expect(result.snapshot.state).toBe('complete')
    expect(stored?.data).toEqual(new Uint8Array([1, 2, 3]).buffer)
    expect(blob?.type).toBe('audio/mpeg')
    expect(await blob?.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer)
    expect(network.requests).toHaveLength(1)
  })

  it('returns the same in-flight promise for duplicate starts', async () => {
    const storage = new MemoryOfflineStorage()
    let resolveResponse!: () => void
    const network = new MemoryNetwork(() => new Promise((resolve) => {
      resolveResponse = () => resolve({ body: 'bytes' })
    }))
    const client = createOfflineMediaClient({
      namespace: 'test',
      storage,
      network,
      requestFactory: async () => ({ url: 'https://example.test/track' }),
    })
    await client.enqueue(asset)

    const first = client.start(asset.id)
    const second = client.start(asset.id)
    expect(second).toBe(first)
    await waitFor(() => typeof resolveResponse === 'function')
    resolveResponse()
    await expect(first).resolves.toMatchObject({ snapshot: { state: 'complete' } })
    expect(network.requests).toHaveLength(1)
  })

  it('stops an active transfer and persists a stable stopped state', async () => {
    const storage = new MemoryOfflineStorage()
    const network = new MemoryNetwork((_request, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(abortError()), { once: true })
    }))
    const client = createOfflineMediaClient({
      namespace: 'test',
      storage,
      network,
      requestFactory: async () => ({ url: 'https://example.test/track' }),
    })
    await client.enqueue(asset)

    const transfer = client.start(asset.id)
    await waitFor(() => network.requests.length === 1)
    client.stop(asset.id)

    await expect(transfer).rejects.toBeInstanceOf(TransferOperationError)
    await expect(client.status(asset.id)).resolves.toMatchObject({ state: 'stopped', persistedBytes: 0 })
  })

  it('converts abandoned downloading work to interrupted without network activity', async () => {
    const storage = new MemoryOfflineStorage()
    const abandoned: StoredAsset = {
      ...asset,
      state: 'downloading',
      persistedBytes: 12,
      completedRanges: [{ start: 0, end: 12 }],
      createdAt: 1,
      updatedAt: 2,
      schemaVersion: 1,
    }
    await storage.putAsset(abandoned)
    const network = new MemoryNetwork(() => ({ body: 'must not fetch' }))
    const client = createOfflineMediaClient({
      namespace: 'test',
      storage,
      network,
      requestFactory: async () => ({ url: 'https://example.test/track' }),
    })

    await expect(client.recoverAbandoned(20)).resolves.toBe(1)
    await expect(client.status(asset.id)).resolves.toMatchObject({
      state: 'interrupted',
      persistedBytes: 12,
      updatedAt: 20,
    })
    expect(network.requests).toHaveLength(0)
  })
})

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return
    await Promise.resolve()
  }
  throw new Error('Timed out waiting for network request.')
}

function abortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}
