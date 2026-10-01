import {
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  defaultSettings,
  normalizeSettings,
  parseStoredSettings,
} from './storage'
import type { ExtensionSettings } from './types'
import { withExtensionDataLock } from './dataLock'
import { BOOKMARK_CACHE_KEY } from '@shared/bookmarkSnapshot'
import { pruneBookmarkCaches } from './bookmarkCache'

/** One worker owns migration and connection-setting writes for this installation. */
export function createSettingsCoordinator() {
  let tail: Promise<unknown> = Promise.resolve()
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.catch(() => undefined).then(() => withExtensionDataLock(work))
    tail = next
    return next
  }

  async function load(): Promise<ExtensionSettings> {
    const local = await chrome.storage.local.get(STORAGE_KEY)
    if (local[STORAGE_KEY] !== undefined) return parseStoredSettings(local[STORAGE_KEY])
    const current = await chrome.storage.sync.get(STORAGE_KEY)
    const legacy =
      current[STORAGE_KEY] === undefined ? await chrome.storage.sync.get(LEGACY_STORAGE_KEY) : {}
    const value = current[STORAGE_KEY] ?? legacy[LEGACY_STORAGE_KEY]
    const settings = normalizeSettings(
      value === undefined ? defaultSettings : parseStoredSettings(value)
    )
    await chrome.storage.local.set({ [STORAGE_KEY]: settings })
    return settings
  }

  return {
    read: () => serialize(load),
    save: (value: ExtensionSettings) =>
      serialize(async () => {
        const settings = normalizeSettings(value)
        const cached = await chrome.storage.local.get(BOOKMARK_CACHE_KEY)
        await chrome.storage.local.set({
          [STORAGE_KEY]: settings,
          [BOOKMARK_CACHE_KEY]: pruneBookmarkCaches(cached[BOOKMARK_CACHE_KEY], settings),
        })
        return settings
      }),
    serialize,
    load,
  }
}
