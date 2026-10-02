import { describe, expect, it } from 'vitest'
import { findBookmarkNavigationTarget, type BookmarkNavigationEntry } from './bookmarkNavigation'

const entries: BookmarkNavigationEntry[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
].map((slug, index) => ({
  slug,
  groupIndex: 0,
  serviceIndex: index,
}))

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

  it('visits the adjacent Synology row before a farther, more precisely aligned iKuai card', () => {
    const layout = createRefs({
      docker: createRect(345, 498, 200, 128),
      dsm: createRect(345, 694, 184, 104),
      nginx: createRect(543, 694, 184, 104),
      guacamole: createRect(345, 812, 184, 104),
      ikuai: createRect(345, 984, 200, 104),
    })
    const items = [...layout.keys()].map((slug, index) => ({
      slug,
      groupIndex: index,
      serviceIndex: 0,
    }))
    for (const [slug, direction, target] of [
      ['docker', 'down', 'dsm'],
      ['dsm', 'down', 'guacamole'],
      ['guacamole', 'down', 'ikuai'],
      ['ikuai', 'up', 'guacamole'],
      ['guacamole', 'up', 'dsm'],
      ['dsm', 'up', 'docker'],
    ] as const) {
      expect(findBookmarkNavigationTarget(slug, direction, items, layout)).toEqual({
        type: 'bookmark',
        slug: target,
      })
    }
  })

  it('moves horizontally within the same row despite small column offsets in other rows', () => {
    const layout = createRefs({
      previous: createRect(96, 0),
      current: createRect(100, 84),
      right: createRect(232, 82),
      next: createRect(104, 168),
    })
    const items = [...layout.keys()].map((slug, serviceIndex) => ({
      slug,
      groupIndex: 0,
      serviceIndex,
    }))
    expect(findBookmarkNavigationTarget('current', 'right', items, layout)).toEqual({
      type: 'bookmark',
      slug: 'right',
    })
    expect(findBookmarkNavigationTarget('right', 'left', items, layout)).toEqual({
      type: 'bookmark',
      slug: 'current',
    })
  })

  it('chooses the closest column in the adjacent row, even when that row is shorter', () => {
    const layout = createRefs({
      current: createRect(500, 0),
      shortLeft: createRect(0, 84),
      shortRight: createRect(132, 84),
      alignedLater: createRect(500, 168),
    })
    const items = [...layout.keys()].map((slug, serviceIndex) => ({
      slug,
      groupIndex: 0,
      serviceIndex,
    }))
    expect(findBookmarkNavigationTarget('current', 'down', items, layout)).toEqual({
      type: 'bookmark',
      slug: 'shortRight',
    })
  })

  it('keeps reading-order wrapping at horizontal edges without jumping to a distant row', () => {
    expect(findBookmarkNavigationTarget('top-right', 'right', entries, refs)).toEqual({
      type: 'bookmark',
      slug: 'bottom-left',
    })
    expect(findBookmarkNavigationTarget('bottom-left', 'left', entries, refs)).toEqual({
      type: 'bookmark',
      slug: 'top-right',
    })
    expect(findBookmarkNavigationTarget('top-left', 'left', entries, refs)).toBeNull()
    expect(findBookmarkNavigationTarget('bottom-right', 'right', entries, refs)).toBeNull()
  })

  it('ignores hidden and missing elements during movement and edge wrapping', () => {
    const layout = createRefs({
      first: createRect(0, 100),
      hidden: createRect(0, 0, 0, 0),
      last: createRect(0, 184),
    })
    const items = ['first', 'hidden', 'missing', 'last'].map((slug, serviceIndex) => ({
      slug,
      groupIndex: 0,
      serviceIndex,
    }))
    expect(findBookmarkNavigationTarget('first', 'up', items, layout)).toEqual({ type: 'search' })
    expect(findBookmarkNavigationTarget('first', 'right', items, layout)).toEqual({
      type: 'bookmark',
      slug: 'last',
    })
    expect(findBookmarkNavigationTarget('last', 'left', items, layout)).toEqual({
      type: 'bookmark',
      slug: 'first',
    })
    expect(findBookmarkNavigationTarget('hidden', 'down', items, layout)).toBeNull()
    expect(findBookmarkNavigationTarget('missing', 'down', items, layout)).toBeNull()
  })

  it('reads the current layout after resizing instead of retaining an old column count', () => {
    const layout = createRefs({
      first: createRect(0, 0),
      second: createRect(132, 0),
      third: createRect(0, 84),
    })
    const items = [...layout.keys()].map((slug, serviceIndex) => ({
      slug,
      groupIndex: 0,
      serviceIndex,
    }))
    expect(findBookmarkNavigationTarget('first', 'down', items, layout)).toEqual({
      type: 'bookmark',
      slug: 'third',
    })
    layout.set('second', { getBoundingClientRect: () => createRect(0, 84) })
    layout.set('third', { getBoundingClientRect: () => createRect(0, 168) })
    expect(findBookmarkNavigationTarget('first', 'down', items, layout)).toEqual({
      type: 'bookmark',
      slug: 'second',
    })
  })
})
