export type BookmarkNavigationDirection = 'left' | 'right' | 'up' | 'down'

export interface BookmarkNavigationEntry {
  slug: string
  groupIndex: number
  serviceIndex: number
}

export type BookmarkNavigationTarget =
  | { type: 'bookmark'; slug: string }
  | { type: 'search' }
  | null

interface BookmarkNavigationElement {
  getBoundingClientRect(): DOMRect
}

export function findBookmarkNavigationTarget(
  currentSlug: string,
  direction: BookmarkNavigationDirection,
  entries: readonly BookmarkNavigationEntry[],
  bookmarkRefs: ReadonlyMap<string, BookmarkNavigationElement>
): BookmarkNavigationTarget {
  const currentIndex = entries.findIndex((entry) => entry.slug === currentSlug)
  const currentElement = bookmarkRefs.get(currentSlug)
  if (currentIndex < 0 || !currentElement) {
    return null
  }

  const currentRect = currentElement.getBoundingClientRect()
  const currentCenterX = currentRect.left + currentRect.width / 2
  const currentCenterY = currentRect.top + currentRect.height / 2
  const candidates = entries.flatMap((entry) => {
    if (entry.slug === currentSlug) {
      return []
    }
    const element = bookmarkRefs.get(entry.slug)
    if (!element) {
      return []
    }
    const rect = element.getBoundingClientRect()
    return [
      {
        entry,
        rect,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      },
    ]
  })

  const directional = candidates.filter(({ rect, centerX }) => {
    switch (direction) {
      case 'left':
        return centerX < currentCenterX - 2
      case 'right':
        return centerX > currentCenterX + 2
      case 'up':
        return rect.bottom <= currentRect.top + Math.min(rect.height, currentRect.height) * 0.15
      case 'down':
        return rect.top >= currentRect.bottom - Math.min(rect.height, currentRect.height) * 0.15
    }
  })

  if ((direction === 'up' || direction === 'down') && directional.length === 0) {
    return { type: 'search' }
  }

  const sameRowThreshold = Math.max(currentRect.height * 1.35, 32)
  const sameColumnThreshold = Math.max(currentRect.width * 1.35, 72)
  const aligned = directional.filter(({ centerX, centerY }) => {
    if (direction === 'left' || direction === 'right') {
      return Math.abs(centerY - currentCenterY) <= sameRowThreshold
    }
    return Math.abs(centerX - currentCenterX) <= sameColumnThreshold
  })
  const pool = aligned.length > 0 ? aligned : directional

  pool.sort((left, right) => {
    if (direction === 'left' || direction === 'right') {
      const primary =
        Math.abs(left.centerX - currentCenterX) - Math.abs(right.centerX - currentCenterX)
      return (
        primary ||
        Math.abs(left.centerY - currentCenterY) - Math.abs(right.centerY - currentCenterY)
      )
    }
    const primary =
      Math.abs(left.centerX - currentCenterX) - Math.abs(right.centerX - currentCenterX)
    return (
      primary || Math.abs(left.centerY - currentCenterY) - Math.abs(right.centerY - currentCenterY)
    )
  })

  if (pool[0]) {
    return { type: 'bookmark', slug: pool[0].entry.slug }
  }

  const fallbackIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1
  const fallbackSlug = entries[fallbackIndex]?.slug
  return fallbackSlug ? { type: 'bookmark', slug: fallbackSlug } : null
}
