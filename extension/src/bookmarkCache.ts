import {
  BOOKMARK_CACHE_KEY,
  cacheSource,
  parseBookmarkSnapshot,
  type BookmarkSnapshot,
} from '@shared/bookmarkSnapshot'
import { withExtensionDataLock } from './dataLock'
import { STORAGE_KEY, parseStoredSettings } from './storage'
import type { ExtensionSettings } from './types'
export interface BookmarkCaches {
  epoch: string
  snapshots: BookmarkSnapshot[]
}
export function configuredSources(settings: ExtensionSettings) {
  return [settings.primaryUrl, settings.fallbackUrl].map(cacheSource).filter(Boolean)
}
export function parseBookmarkCaches(value: unknown, settings: ExtensionSettings): BookmarkCaches {
  const raw = value as Partial<BookmarkCaches> | null
  const sources = configuredSources(settings)
  return {
    epoch: typeof raw?.epoch === 'string' ? raw.epoch : '',
    snapshots: Array.isArray(raw?.snapshots)
      ? raw.snapshots
          .flatMap((entry) => {
            const parsed = parseBookmarkSnapshot(entry)
            return parsed && sources.includes(parsed.source) ? [parsed] : []
          })
          .slice(0, 2)
      : [],
  }
}
export async function readBookmarkCaches(settings: ExtensionSettings) {
  const raw = await chrome.storage.local.get(BOOKMARK_CACHE_KEY)
  return parseBookmarkCaches(raw[BOOKMARK_CACHE_KEY], settings)
}
export async function changeBookmarkCache(
  settings: ExtensionSettings,
  epoch: string,
  source: string,
  value: BookmarkSnapshot | null
) {
  return withExtensionDataLock(async () => {
    const stored = await chrome.storage.local.get([STORAGE_KEY, BOOKMARK_CACHE_KEY])
    const current = parseStoredSettings(stored[STORAGE_KEY])
    if (
      current.settingsRevision !== settings.settingsRevision ||
      current.primaryUrl !== settings.primaryUrl ||
      current.fallbackUrl !== settings.fallbackUrl
    )
      return false
    const caches = parseBookmarkCaches(stored[BOOKMARK_CACHE_KEY], current)
    source = cacheSource(source)
    if (caches.epoch !== epoch || !configuredSources(current).includes(source)) return false
    const snapshot = value && parseBookmarkSnapshot(value, source)
    if (value && !snapshot) return false
    const next = {
      epoch: snapshot ? caches.epoch : crypto.randomUUID(),
      snapshots: [
        ...caches.snapshots.filter((entry) => entry.source !== source),
        ...(snapshot ? [snapshot] : []),
      ],
    }
    await chrome.storage.local.set({ [BOOKMARK_CACHE_KEY]: next })
    return true
  })
}
export function pruneBookmarkCaches(value: unknown, settings: ExtensionSettings): BookmarkCaches {
  return { ...parseBookmarkCaches(value, settings), epoch: crypto.randomUUID() }
}
