import { createContext, useContext } from 'react'

import type { BookItem, DownloadBookOptions, OfflineBook, PersistedPlaybackState, ServerConfig, UserSession } from '../lib/types'

export interface AppContextValue {
  server: ServerConfig | null
  setServer: (server: ServerConfig | null) => void
  session: UserSession | null
  setSession: (session: UserSession | null) => void
  offlineBooks: OfflineBook[]
  refreshBooks: () => Promise<void>
  refreshOfflineBooks: () => Promise<void>
  playbackState: PersistedPlaybackState | null
  startBook: (item: BookItem, startTime?: number) => Promise<void>
  downloadCurrentBook: (item: BookItem, options?: DownloadBookOptions) => Promise<void>
  removeOfflineBook: (itemId: string) => Promise<void>
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useAppContext() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('App context is not available.')
  }
  return context
}
