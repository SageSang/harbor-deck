export type BookmarkNavigationDirection = 'left' | 'right' | 'up' | 'down'

export interface BookmarkNavigationEntry {
  slug: string
  groupIndex: number
  serviceIndex: number
}

export type BookmarkNavigationTarget =
  { type: 'bookmark'; slug: string } | { type: 'search' } | null

interface BookmarkNavigationElement {
  getBoundingClientRect(): DOMRect
}

export function findBookmarkNavigationTarget(
  currentSlug: string,
  direction: BookmarkNavigationDirection,
  entries: readonly BookmarkNavigationEntry[],
  bookmarkRefs: ReadonlyMap<string, BookmarkNavigationElement>
): BookmarkNavigationTarget {
  const visible = entries.flatMap((entry) => {
    const element = bookmarkRefs.get(entry.slug)
    if (!element) return []
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return []
    return [{ entry, rect, centerX: rect.left + rect.width / 2 }]
  })
  const currentIndex = visible.findIndex(({ entry }) => entry.slug === currentSlug)
  const current = visible[currentIndex]
  if (!current) return null

  // Card widths differ between compact groups and full-width, wrapping groups.
  // Follow the adjacent visual row first; exact X alignment must not skip rows.
  const sameRow = (left: DOMRect, right: DOMRect) =>
    Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) >
    Math.min(left.height, right.height) / 2

  const horizontal = direction === 'left' || direction === 'right'
  const directional = visible.filter(({ entry, rect, centerX }) => {
    if (entry.slug === currentSlug) return false
    switch (direction) {
      case 'left':
        return sameRow(rect, current.rect) && centerX < current.centerX - 2
      case 'right':
        return sameRow(rect, current.rect) && centerX > current.centerX + 2
      case 'up':
        return rect.bottom <= current.rect.top + Math.min(rect.height, current.rect.height) * 0.15
      case 'down':
        return rect.top >= current.rect.bottom - Math.min(rect.height, current.rect.height) * 0.15
    }
  })

  if (!horizontal && directional.length === 0) return { type: 'search' }

  let pool = directional
  if (!horizontal) {
    const nearest = directional.reduce((best, candidate) =>
      (
        direction === 'down'
          ? candidate.rect.top < best.rect.top
          : candidate.rect.bottom > best.rect.bottom
      )
        ? candidate
        : best
    )
    pool = directional.filter(({ rect }) => sameRow(rect, nearest.rect))
  }
  pool.sort(
    (left, right) =>
      Math.abs(left.centerX - current.centerX) - Math.abs(right.centerX - current.centerX)
  )
  if (pool[0]) return { type: 'bookmark', slug: pool[0].entry.slug }

  // Preserve reading-order wrapping at horizontal edges, excluding hidden refs.
  const fallbackIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1
  const fallbackSlug = visible[fallbackIndex]?.entry.slug
  return fallbackSlug ? { type: 'bookmark', slug: fallbackSlug } : null
}
