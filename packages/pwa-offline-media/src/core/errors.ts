import type { TransferState } from './types.ts'

export class InvalidTransferTransitionError extends Error {
  readonly from: TransferState
  readonly to: TransferState

  constructor(from: TransferState, to: TransferState) {
    super(`Invalid transfer transition: ${from} -> ${to}`)
    this.name = 'InvalidTransferTransitionError'
    this.from = from
    this.to = to
  }
}

export class DuplicateTransferError extends Error {
  readonly assetId: string

  constructor(assetId: string) {
    super(`A transfer is already active for asset ${assetId}.`)
    this.name = 'DuplicateTransferError'
    this.assetId = assetId
  }
}

export class TransferOperationError extends Error {
  readonly transferError: import('./types.ts').TransferError

  constructor(transferError: import('./types.ts').TransferError, message = transferError.message) {
    super(message)
    this.name = 'TransferOperationError'
    this.transferError = transferError
  }
}
