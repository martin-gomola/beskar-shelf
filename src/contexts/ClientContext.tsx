import { createContext, useContext } from 'react'

import type { AudiobookshelfClient } from '../lib/api'

export const ClientContext = createContext<AudiobookshelfClient | null>(null)

export function useClient() {
  const context = useContext(ClientContext)
  if (!context) {
    throw new Error('Client context is not available.')
  }
  return context
}
