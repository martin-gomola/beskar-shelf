import { describe, expect, it } from 'vitest'

import {
  InvalidTransferTransitionError,
  canTransition,
  recoverAbandonedTransfer,
  transitionSnapshot,
  transitionTransfer,
} from '../src/index.ts'
import type { TransferSnapshot, TransferState } from '../src/index.ts'

const snapshot: TransferSnapshot = {
  id: 'asset-1',
  groupId: 'group-1',
  state: 'downloading',
  persistedBytes: 4096,
  completedRanges: [{ start: 0, end: 4096 }],
  createdAt: 100,
  updatedAt: 200,
}

describe('offline media transfer state machine', () => {
  it.each([
    ['idle', 'queued'],
    ['queued', 'downloading'],
    ['queued', 'stopped'],
    ['downloading', 'complete'],
    ['downloading', 'stopping'],
    ['downloading', 'interrupted'],
    ['downloading', 'failed'],
    ['stopping', 'stopped'],
    ['stopped', 'queued'],
    ['interrupted', 'queued'],
    ['failed', 'queued'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true)
    expect(transitionTransfer(from, to)).toBe(to)
  })

  it.each([
    ['idle', 'downloading'],
    ['complete', 'queued'],
    ['stopping', 'queued'],
    ['stopped', 'complete'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(() => transitionTransfer(from, to)).toThrow(InvalidTransferTransitionError)
  })

  it('converts abandoned downloading work to interrupted without changing verified bytes', () => {
    expect(recoverAbandonedTransfer(snapshot, 300)).toEqual({
      ...snapshot,
      state: 'interrupted',
      updatedAt: 300,
    })
  })

  it('leaves terminal and non-active work unchanged during recovery', () => {
    for (const state of ['idle', 'queued', 'stopped', 'interrupted', 'failed', 'complete'] as TransferState[]) {
      const next = { ...snapshot, state }
      expect(recoverAbandonedTransfer(next, 300)).toBe(next)
    }
  })

  it('updates only state and timestamp when transitioning a snapshot', () => {
    expect(transitionSnapshot(snapshot, 'stopping', 400)).toEqual({
      ...snapshot,
      state: 'stopping',
      updatedAt: 400,
    })
  })
})
