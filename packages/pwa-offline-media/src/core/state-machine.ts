import { InvalidTransferTransitionError } from './errors.ts'
import type { TransferSnapshot, TransferState } from './types.ts'

const TRANSITIONS: Record<TransferState, readonly TransferState[]> = {
  idle: ['queued'],
  queued: ['downloading', 'stopped'],
  downloading: ['complete', 'stopping', 'interrupted', 'failed'],
  stopping: ['stopped'],
  stopped: ['queued'],
  interrupted: ['queued'],
  failed: ['queued'],
  complete: [],
}

export function canTransition(from: TransferState, to: TransferState) {
  return TRANSITIONS[from].includes(to)
}

export function transitionTransfer(from: TransferState, to: TransferState) {
  if (!canTransition(from, to)) {
    throw new InvalidTransferTransitionError(from, to)
  }
  return to
}

export function recoverAbandonedTransfer(snapshot: TransferSnapshot, at: number) {
  if (snapshot.state !== 'downloading') {
    return snapshot
  }

  transitionTransfer(snapshot.state, 'interrupted')
  return {
    ...snapshot,
    state: 'interrupted',
    updatedAt: at,
  } satisfies TransferSnapshot
}

export function transitionSnapshot(
  snapshot: TransferSnapshot,
  state: TransferState,
  at: number,
) {
  transitionTransfer(snapshot.state, state)
  return {
    ...snapshot,
    state,
    updatedAt: at,
  } satisfies TransferSnapshot
}
