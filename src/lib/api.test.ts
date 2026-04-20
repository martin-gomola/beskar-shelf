import { describe, expect, it, vi } from 'vitest'

import { AudiobookshelfClient } from './api'
import type { ServerConfig, UserSession } from './types'

const server: ServerConfig = {
  baseUrl: 'https://books.example.com',
  mode: 'direct',
}

const session: UserSession = {
  token: 'token-123',
  user: {
    id: 'user_1',
    username: 'mando',
  },
}

describe('AudiobookshelfClient', () => {
  it('adds token to streamed asset URLs', () => {
    const client = new AudiobookshelfClient(server, session)

    expect(client.assetUrl('/metadata/items/book/cover.jpg')).toBe(
      'https://books.example.com/metadata/items/book/cover.jpg?token=token-123',
    )
    expect(client.streamUrl('/s/item/book/chapter-1.mp3')).toBe(
      'https://books.example.com/s/item/book/chapter-1.mp3?token=token-123',
    )
  })

  it('parses login responses that nest the user token under response.user', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        response: {
          user: {
            id: 'user_1',
            username: 'mando',
            token: 'token-123',
          },
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new AudiobookshelfClient(server, null)
    await expect(client.login('mando', 'secret')).resolves.toEqual(session)
  })

  it('treats plain-text OK mutation responses as success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain; charset=utf-8' }),
        text: async () => 'OK',
      })
    vi.stubGlobal('fetch', fetchMock)

    const client = new AudiobookshelfClient(server, session)
    await expect(client.updateProgress('book_1', {
      duration: 100,
      progress: 0.5,
      currentTime: 50,
      isFinished: false,
    })).resolves.toBeUndefined()
  })

  it('maps item metadata and progress into the client book shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'book_1',
        libraryId: 'lib_1',
        progress: {
          progress: 0.25,
          currentTime: 300,
          isFinished: false,
        },
        media: {
          duration: 1200,
          coverPath: '/metadata/items/book_1/cover.jpg',
          chapters: [{ id: 1, title: 'Start', start: 0, end: 120 }],
          audioTracks: [
            {
              contentUrl: '/s/item/book_1/part-1.mp3',
              mimeType: 'audio/mpeg',
              duration: 1200,
              title: 'Part 1',
            },
          ],
          metadata: {
            title: 'The Way',
            author: 'Din Djarin',
            description: 'Foundling notes',
            genres: ['Sci-Fi'],
          },
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new AudiobookshelfClient(server, session)
    await expect(client.getItem('book_1')).resolves.toMatchObject({
      id: 'book_1',
      title: 'The Way',
      author: 'Din Djarin',
      progress: 0.25,
      currentTime: 300,
      chapters: [{ title: 'Start' }],
      audioTracks: [{ title: 'Part 1', contentUrl: '/s/item/book_1/part-1.mp3' }],
    })
  })

  it('maps personalized series entities to the first book in the series', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ([
        {
          id: 'recent-series',
          label: 'Recent series',
          entities: [
            {
              id: 'series_1',
              name: 'Dragon Cycle',
              libraryId: 'lib_1',
              books: [
                {
                  id: 'book_9',
                  libraryId: 'lib_1',
                  relPath: 'Jane Doe/Dragon Cycle',
                  media: {
                    coverPath: '/covers/dragon.jpg',
                    duration: 999,
                    metadata: {
                      title: 'Dragon Cycle',
                      authorName: '',
                    },
                  },
                },
              ],
            }
          ],
        },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new AudiobookshelfClient(server, session)
    await expect(client.getPersonalized('lib_1')).resolves.toMatchObject([
      {
        entities: [
          {
            id: 'book_9',
            title: 'Dragon Cycle',
            author: 'Jane Doe',
            coverPath: '/covers/dragon.jpg',
          },
        ],
      },
    ])
  })

  it('falls back to media.audioFiles when ABS does not pre-build audioTracks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'book_2',
        libraryId: 'lib_1',
        media: {
          duration: 1799,
          metadata: { title: 'Around the world', authorName: 'Jules Verne' },
          audioTracks: [],
          audioFiles: [
            {
              index: 1,
              mimeType: 'audio/mpeg',
              codec: 'mp3',
              duration: 900,
              metadata: { filename: '000 - Part.mp3' },
            },
            {
              index: 2,
              mimeType: 'audio/mpeg',
              codec: 'mp3',
              duration: 899,
              metadata: { filename: '001 - Part.mp3' },
            },
          ],
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new AudiobookshelfClient(server, session)
    const item = await client.getItem('book_2')

    expect(item.audioTracks).toHaveLength(2)
    expect(item.audioTracks[0]).toMatchObject({
      duration: 900,
      title: '000 - Part.mp3',
      mimeType: 'audio/mpeg',
      startOffset: 0,
    })
    expect(item.audioTracks[1].startOffset).toBe(900)
  })

  it('builds a wss Socket.IO URL routed through the same base as the REST API', () => {
    const client = new AudiobookshelfClient(server, session)

    const url = new URL(client.socketIoUrl(session.token))

    expect(url.protocol).toBe('wss:')
    expect(url.host).toBe('books.example.com')
    expect(url.pathname).toBe('/socket.io/')
    expect(url.searchParams.get('EIO')).toBe('4')
    expect(url.searchParams.get('transport')).toBe('websocket')
    expect(url.searchParams.get('token')).toBe(session.token)
  })

  it('drops personalized shelves that are not browsable books or series', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ([
        {
          id: 'newest-authors',
          label: 'Newest Authors',
          entities: [
            {
              id: 'author_1',
              name: 'Petra Stehlikova',
              numBooks: 1,
            },
          ],
        },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new AudiobookshelfClient(server, session)
    await expect(client.getPersonalized('lib_1')).resolves.toEqual([])
  })
})
