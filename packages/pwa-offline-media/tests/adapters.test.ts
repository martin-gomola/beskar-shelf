import { describe, expect, it, vi } from 'vitest'

import { MemoryNetwork, MemoryOfflineStorage } from '../src/testing/index.ts'
import type { StoredAsset } from '../src/index.ts'

const asset: StoredAsset = {
  id: 'asset-1',
  groupId: 'book-1',
  state: 'complete',
  persistedBytes: 3,
  completedRanges: [{ start: 0, end: 3 }],
  createdAt: 100,
  updatedAt: 100,
  schemaVersion: 1,
}

describe('deterministic offline media adapters', () => {
  it('copies stored manifests and binary chunks at the port boundary', async () => {
    const storage = new MemoryOfflineStorage()
    const data = new Uint8Array([1, 2, 3]).buffer

    await storage.putAsset(asset)
    await storage.putChunk({ assetId: asset.id, start: 0, end: 3, data })

    const readAsset = await storage.getAsset(asset.id)
    const readChunk = await storage.getChunk(asset.id, 0)
    expect(readAsset).toEqual(asset)
    expect(readChunk?.data).toEqual(data)

    new Uint8Array(data)[0] = 9
    expect(new Uint8Array((await storage.getChunk(asset.id, 0))!.data)[0]).toBe(1)
  })

  it('lists manifests without reading their binary chunks and deletes by asset key', async () => {
    const storage = new MemoryOfflineStorage()
    await storage.putAsset(asset)
    await storage.putChunk({ assetId: asset.id, start: 0, end: 3, data: new ArrayBuffer(3) })
    storage.operations.length = 0

    await expect(storage.listAssets('book-1')).resolves.toEqual([asset])
    expect(storage.operations).toEqual(['listAssets'])

    await storage.deleteAsset(asset.id)
    expect(storage.operations).toEqual(['listAssets', 'deleteAsset'])
    await expect(storage.getChunk(asset.id, 0)).resolves.toBeUndefined()
  })

  it('supports failure injection at a named storage operation', async () => {
    const storage = new MemoryOfflineStorage({
      beforeOperation: (operation) => {
        if (operation === 'putChunk') throw new Error('quota')
      },
    })

    await expect(storage.putChunk({
      assetId: asset.id,
      start: 0,
      end: 3,
      data: new ArrayBuffer(3),
    })).rejects.toThrow('quota')
  })

  it('records fresh requests and returns an isolated response buffer', async () => {
    const handler = vi.fn().mockResolvedValue({
      body: new Uint8Array([4, 5]),
      headers: { 'content-type': 'audio/mpeg' },
    })
    const network = new MemoryNetwork(handler)
    const request = { url: 'https://example.test/audio' }

    const response = await network.fetch(request)
    const first = await response.arrayBuffer()
    new Uint8Array(first)[0] = 0
    const second = await response.arrayBuffer()

    expect(handler).toHaveBeenCalledWith(request, undefined)
    expect(network.requests).toEqual([request])
    expect(response.ok).toBe(true)
    expect(response.headers.get('content-type')).toBe('audio/mpeg')
    expect(new Uint8Array(second)[0]).toBe(4)
  })
})
