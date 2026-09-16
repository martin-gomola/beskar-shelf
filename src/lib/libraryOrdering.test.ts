import { describe, expect, it } from 'vitest'

import { orderItemsByIds } from './libraryOrdering'

describe('orderItemsByIds', () => {
  it('uses the series order while preserving unknown items after it', () => {
    const items = [
      { id: 'book-3', title: 'Three' },
      { id: 'book-1', title: 'One' },
      { id: 'book-x', title: 'Unknown' },
      { id: 'book-2', title: 'Two' },
    ]

    expect(orderItemsByIds(items, ['book-1', 'book-2', 'book-3']).map((item) => item.id)).toEqual([
      'book-1',
      'book-2',
      'book-3',
      'book-x',
    ])
  })
})
