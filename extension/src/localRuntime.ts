import {
  BOOKMARK_CACHE_KEY,
  cacheSource,
  parseBookmarkSnapshot,
  type BookmarkSnapshot,
} from '@shared/bookmarkSnapshot'
import { configureClientRuntime } from '@/lib/clientRuntime'
import { parseBookmarkCaches, readBookmarkCaches } from './bookmarkCache'
import { withExtensionDataLock } from './dataLock'
import { STORAGE_KEY, parseStoredSettings } from './storage'
import type { ExtensionSettings } from './types'

const epochKey = `${BOOKMARK_CACHE_KEY}:epoch`
export async function installLocalRuntime(settings: ExtensionSettings) {
  let caches = await readBookmarkCaches(settings).catch(() => ({ epoch: '', snapshots: [] }))
  const initial = [...caches.snapshots].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  let source = initial?.source ?? cacheSource(settings.primaryUrl || settings.fallbackUrl)
  let snapshot: BookmarkSnapshot | null = initial ?? null
  let epoch = caches.epoch
  let clearAccess = false
  let invalidated = false
  let connected = false
  let connecting: Promise<void> | undefined
  let writes: Promise<unknown> = Promise.resolve()
  const ownEpochs = new Set<string>()
  const notify = () => window.dispatchEvent(new Event('harbordeck-bookmark-cache-changed'))
  const currentSettings = (value: unknown) => {
    try {
      const current = parseStoredSettings(value)
      return (
        current.settingsRevision === settings.settingsRevision &&
        current.primaryUrl === settings.primaryUrl &&
        current.fallbackUrl === settings.fallbackUrl
      )
    } catch {
      return false
    }
  }
  function persist(value: typeof snapshot, oldEpoch: string, nextEpoch: string) {
    const target = source
    const accessLost = !value && clearAccess
    ownEpochs.add(nextEpoch)
    writes = writes
      .catch(() => undefined)
      .then(() =>
        withExtensionDataLock(async () => {
          const stored = await chrome.storage.local.get([STORAGE_KEY, BOOKMARK_CACHE_KEY])
          if (!currentSettings(stored[STORAGE_KEY])) return
          const current = parseBookmarkCaches(stored[BOOKMARK_CACHE_KEY], settings)
          if (current.epoch !== oldEpoch) return
          await chrome.storage.local.set({
            [BOOKMARK_CACHE_KEY]: {
              epoch: nextEpoch,
              accessLost,
              snapshots: value
                ? [...current.snapshots.filter((item) => item.source !== target), value]
                : [],
            },
          })
        })
      )
      .catch(() => {
        /* Quota/private mode: this tab remains usable. */
      })
  }
  const prepare = () => {
    if (invalidated)
      return Promise.reject(
        new Error('连接设置已改变，请打开新标签页 / Connection changed; open a new tab')
      )
    if (connected) return Promise.resolve()
    if (connecting) return connecting
    const sources = [
      ...new Set([settings.primaryUrl, settings.fallbackUrl].map(cacheSource).filter(Boolean)),
    ]
    if (!sources.length)
      return Promise.reject(new Error('请先配置服务地址 / Configure a server address'))
    // Race real read-only APIs, not a short health probe. Never fail over a write.
    const controllers = sources.map(() => new AbortController())
    const loginRequired: string[] = []
    connecting = Promise.any(
      sources.map(async (target, index) => {
        const timer = setTimeout(() => controllers[index].abort(), 5000)
        try {
          const response = await fetch(new URL('/api/auth/status', target), {
            credentials: 'include',
            cache: 'no-store',
            signal: controllers[index].signal,
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const status = await response.json()
          if (
            typeof status.authenticated !== 'boolean' ||
            typeof status.setupRequired !== 'boolean'
          )
            throw new Error('Invalid server response')
          if (!status.authenticated) {
            loginRequired.push(target)
            throw new Error('Sign in required')
          }
          return target
        } finally {
          clearTimeout(timer)
        }
      })
    )
      .catch((error) => {
        const target = loginRequired.includes(source) ? source : loginRequired[0]
        if (!target) throw error
        return target
      })
      .then((target) => {
        controllers.forEach((controller) => controller.abort())
        if (invalidated) throw new Error('Connection changed')
        if (target !== source) {
          source = target
          // Keep the last configured display until the new connection returns real data.
          // It remains read-only and is never submitted to the selected server.
          snapshot = caches.snapshots.find((item) => item.source === source) ?? snapshot
          window.dispatchEvent(new Event('harbordeck-source-selected'))
          notify()
        }
        connected = true
      })
      .catch((error) => {
        connecting = undefined
        throw error
      })
    return connecting
  }
  configureClientRuntime({
    source: () => source,
    beforeCacheClear: (value) => {
      clearAccess = value
    },
    prepare,
    openSettings: () => {
      void chrome.runtime.openOptionsPage()
    },
    cache: {
      getItem: (key) =>
        key === epochKey
          ? epoch
          : key === BOOKMARK_CACHE_KEY && snapshot
            ? JSON.stringify(snapshot)
            : null,
      removeItem: (key) => {
        if (key === BOOKMARK_CACHE_KEY) snapshot = null
      },
      setItem: (key, value) => {
        if (key === epochKey) {
          const previous = epoch
          epoch = value
          persist(null, previous, epoch)
        } else if (key === BOOKMARK_CACHE_KEY) {
          const next = parseBookmarkSnapshot(value, source)
          if (!next) return
          snapshot = next
          persist(next, epoch, epoch)
        }
      },
    },
  })
  chrome.storage.onChanged?.addListener((rawChanges, area) => {
    const changes = rawChanges as Record<string, { newValue?: unknown }>
    if (area !== 'local') return
    if (changes[STORAGE_KEY] && !currentSettings(changes[STORAGE_KEY].newValue)) {
      invalidated = true
      snapshot = null
      notify()
      window.dispatchEvent(new Event('harbordeck-source-changed'))
    }
    if (changes[BOOKMARK_CACHE_KEY]) {
      caches = parseBookmarkCaches(changes[BOOKMARK_CACHE_KEY].newValue, settings)
      if (ownEpochs.has(caches.epoch)) return
      const revoked = epoch !== caches.epoch
      epoch = caches.epoch
      snapshot = caches.snapshots.find((item) => item.source === source) ?? null
      if (revoked) {
        window.dispatchEvent(new StorageEvent('storage', { key: epochKey, newValue: epoch }))
        if (
          (changes[BOOKMARK_CACHE_KEY].newValue as { accessLost?: boolean } | undefined)?.accessLost
        )
          window.dispatchEvent(new Event('harbordeck-cache-revoked'))
      }
      notify()
    }
  })
  return { prepare, source: () => source, snapshot: initial }
}
