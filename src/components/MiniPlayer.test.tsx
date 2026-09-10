import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AppContext } from '../contexts/AppContext'
import { ClientContext } from '../contexts/ClientContext'
import { PlayerContext } from '../contexts/PlayerContext'
import { PlayerTimeContext } from '../contexts/PlayerContext'
import type { AppContextValue } from '../contexts/AppContext'
import type { PlayerContextValue } from '../contexts/PlayerContext'
import type { ActivePlayback } from '../hooks/usePlayback'
import type { AudiobookshelfClient } from '../lib/api'
import type { BookItem, PlaybackSession } from '../lib/types'
import { MiniPlayer } from './MiniPlayer'

const item = { id: 'book-1', title: 'Book', author: 'Author', coverPath: null } as BookItem
const playbackSession: PlaybackSession = {
  id: 'session-1',
  libraryItemId: item.id,
  duration: 1,
  displayTitle: item.title,
  displayAuthor: item.author,
  coverPath: null,
  chapters: [],
  audioTracks: [],
}
const activePlayback = {
  item,
  session: playbackSession,
  sources: [],
  trackIndex: 0,
  duration: 1,
} as ActivePlayback

function renderMiniPlayer(stopPlayback: () => void) {
  const player = {
    activePlayback,
    isPlaying: true,
    playbackRate: 1,
    togglePlayback: vi.fn().mockResolvedValue(undefined),
    stopPlayback,
    seekTo: vi.fn(),
    seekBy: vi.fn(),
    setPlaybackRate: vi.fn(),
    jumpToTrack: vi.fn(),
    jumpToPreviousTrack: vi.fn(),
    jumpToNextTrack: vi.fn(),
    setIsSeeking: vi.fn(),
    audioRef: { current: null },
  } as PlayerContextValue
  const app = { playbackState: null } as AppContextValue
  const client = {} as AudiobookshelfClient

  render(
    <MemoryRouter>
      <ClientContext.Provider value={client}>
        <AppContext.Provider value={app}>
          <PlayerContext.Provider value={player}>
            <PlayerTimeContext.Provider value={{ playbackTime: 0, currentTrackDuration: 1 }}>
              <MiniPlayer />
            </PlayerTimeContext.Provider>
          </PlayerContext.Provider>
        </AppContext.Provider>
      </ClientContext.Provider>
    </MemoryRouter>,
  )
  return player
}

describe('MiniPlayer', () => {
  it('stops playback instead of hiding a live session', () => {
    const stopPlayback = vi.fn()
    const player = renderMiniPlayer(stopPlayback)

    fireEvent.click(screen.getByRole('button', { name: 'Stop and close' }))

    expect(stopPlayback).toHaveBeenCalledOnce()
    expect(player.togglePlayback).not.toHaveBeenCalled()
  })
})
