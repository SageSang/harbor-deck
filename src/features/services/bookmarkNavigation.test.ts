import { describe, expect, it } from 'vitest'
import {
  findBookmarkNavigationTarget,
  type BookmarkNavigationEntry,
} from './bookmarkNavigation'

const entries: BookmarkNavigationEntry[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(
  (slug, index) => ({
    slug,
    groupIndex: 0,
    serviceIndex: index,
  })
)

function createRect(left: number, top: number, width = 120, height = 72): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  }
}

function createRefs(rects: Record<string, DOMRect>) {
  return new Map(
    Object.entries(rects).map(([slug, rect]) => [slug, { getBoundingClientRect: () => rect }])
  )
}

describe('bookmark keyboard navigation', () => {
  const refs = createRefs({
    'top-left': createRect(0, 0),
    'top-right': createRect(132, 3),
    'bottom-left': createRect(0, 84),
    'bottom-right': createRect(132, 87),
  })

  it('returns to search from every card in the first visual row', () => {
    expect(findBookmarkNavigationTarget('top-left', 'up', entries, refs)).toEqual({
      type: 'search',
    })
    expect(findBookmarkNavigationTarget('top-right', 'up', entries, refs)).toEqual({
      type: 'search',
    })
  })

  it('returns to search from every card in the last visual row', () => {
    expect(findBookmarkNavigationTarget('bottom-left', 'down', entries, refs)).toEqual({
      type: 'search',
    })
    expect(findBookmarkNavigationTarget('bottom-right', 'down', entries, refs)).toEqual({
      type: 'search',
    })
  })

  it('keeps directional movement between visual rows and columns', () => {
    expect(findBookmarkNavigationTarget('top-right', 'left', entries, refs)).toEqual({
      type: 'bookmark',
      slug: 'top-left',
    })
    expect(findBookmarkNavigationTarget('top-left', 'right', entries, refs)).toEqual({
      type: 'bookmark',
      slug: 'top-right',
    })
    expect(findBookmarkNavigationTarget('top-right', 'down', entries, refs)).toEqual({
      type: 'bookmark',
      slug: 'bottom-right',
    })
    expect(findBookmarkNavigationTarget('bottom-left', 'up', entries, refs)).toEqual({
      type: 'bookmark',
      slug: 'top-left',
    })
  })
})
