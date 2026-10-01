import { useEffect, useState } from 'react'
import { BOOKMARK_CACHE_CHANGED, readBookmarkCache } from './bookmarkCache'

export function useBookmarkCache() {
  const [snapshot, setSnapshot] = useState(readBookmarkCache)
  useEffect(() => {
    const read = () => setSnapshot(readBookmarkCache())
    window.addEventListener(BOOKMARK_CACHE_CHANGED, read)
    read()
    return () => window.removeEventListener(BOOKMARK_CACHE_CHANGED, read)
  }, [])
  return snapshot
}
