export { DuplicateTransferError, InvalidTransferTransitionError, TransferOperationError } from './core/errors.ts'
export { OfflineMediaClientImpl, createOfflineMediaClient } from './core/client.ts'
export {
  canTransition,
  recoverAbandonedTransfer,
  transitionSnapshot,
  transitionTransfer,
} from './core/state-machine.ts'
export type {
  CompletedRange,
  OfflineAsset,
  OfflineMediaClient,
  OfflineMediaOptions,
  RuntimeRequest,
  TransferError,
  TransferErrorCode,
  TransferEvent,
  TransferResult,
  TransferSnapshot,
  TransferState,
} from './core/types.ts'
export type {
  OfflineStorage,
  StoredAsset,
  StoredChunk,
  StoredObject,
} from './storage/types.ts'
export { snapshotToStoredAsset } from './storage/types.ts'
export { IndexedDbOfflineStorage } from './storage/indexeddb.ts'
export type {
  IndexedDbMigration,
  IndexedDbMigrationResult,
  IndexedDbOfflineStorageOptions,
} from './storage/indexeddb.ts'
export type { OfflineNetwork, OfflineNetworkResponse } from './network/types.ts'
