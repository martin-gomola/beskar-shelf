import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import SettingsPage from './SettingsPage'
import { AppContext, type AppContextValue } from '../contexts/AppContext'

function renderSettingsPage(appOverrides: Partial<AppContextValue> = {}) {
  const appContextValue: AppContextValue = {
    server: { baseUrl: 'https://books.example.com', mode: 'direct' },
    setServer: vi.fn(),
    session: {
      token: 'token-123',
      user: {
        id: 'user-1',
        username: 'mando',
      },
    },
    setSession: vi.fn(),
    offlineBooks: [],
    refreshBooks: vi.fn().mockResolvedValue(undefined),
    refreshOfflineBooks: vi.fn().mockResolvedValue(undefined),
    playbackState: null,
    startBook: vi.fn().mockResolvedValue(undefined),
    downloadCurrentBook: vi.fn().mockResolvedValue(undefined),
    removeOfflineBook: vi.fn().mockResolvedValue(undefined),
    ...appOverrides,
  }

  render(
    <MemoryRouter>
      <AppContext.Provider value={appContextValue}>
        <SettingsPage />
      </AppContext.Provider>
    </MemoryRouter>,
  )

  return appContextValue
}

describe('SettingsPage', () => {
  it('refreshes book data from settings', async () => {
    const user = userEvent.setup()
    const appContextValue = renderSettingsPage()

    await user.click(screen.getByRole('button', { name: /refresh books/i }))

    await waitFor(() => {
      expect(appContextValue.refreshBooks).toHaveBeenCalledTimes(1)
    })
  })
})
