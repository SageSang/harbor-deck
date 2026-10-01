import {
  BOOKMARK_CACHE_KEY,
  CACHE_MESSAGE,
  makeBookmarkSnapshot,
  parseBookmarkSnapshot,
  cacheSource,
  type BookmarkSnapshot,
} from '@shared/bookmarkSnapshot'
import type { NavigationConfig } from '@/config/schema'

const EPOCH_KEY = `${BOOKMARK_CACHE_KEY}:epoch`
export const BOOKMARK_CACHE_CHANGED = 'harbordeck-bookmark-cache-changed'
export const BOOKMARK_CACHE_REFRESH = 'harbordeck-bookmark-cache-refresh'
export const BOOKMARK_CACHE_OPEN = 'harbordeck-bookmark-cache-open'
export const BOOKMARK_AUTH_REQUIRED = 'harbordeck-bookmark-auth-required'
let username: string | null = null
let verified: BookmarkSnapshot | null = null
let memoryEpoch = ''
let suppressed = false
let accessDenied = false
let bridge: { origin: string; nonce: string } | null = null

export function readBookmarkCache() {
  if (suppressed) return null
  try {
    return parseBookmarkSnapshot(localStorage.getItem(BOOKMARK_CACHE_KEY), location.href)
  } catch {
    return null
  }
}
export function bookmarkCacheEpoch() {
  try {
    return `${memoryEpoch}:${localStorage.getItem(EPOCH_KEY) ?? ''}`
  } catch {
    return memoryEpoch
  }
}
function send(kind: string, snapshot?: BookmarkSnapshot) {
  if (bridge)
    window.parent.postMessage(
      { type: CACHE_MESSAGE, kind, nonce: bridge.nonce, snapshot },
      bridge.origin
    )
}
function changed() {
  window.dispatchEvent(new Event(BOOKMARK_CACHE_CHANGED))
}
export function clearBookmarkCache(accessLost = false) {
  memoryEpoch = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  verified = null
  suppressed = true
  if (accessLost) {
    username = null
    accessDenied = true
  }
  try {
    localStorage.removeItem(BOOKMARK_CACHE_KEY)
  } catch {
    /* Optional cache; writes must never block logout. */
  }
  try {
    localStorage.setItem(EPOCH_KEY, memoryEpoch)
  } catch {
    /* Optional. */
  }
  send(accessLost ? 'denied' : 'clear')
  changed()
}
export function setBookmarkCacheUser(next: string | null) {
  if (!next) {
    clearBookmarkCache(true)
    return
  }
  if (
    (username && username !== next) ||
    (readBookmarkCache()?.username && readBookmarkCache()?.username !== next)
  )
    clearBookmarkCache(true)
  username = next
  accessDenied = false
}
export function captureBookmarkCacheScope() {
  return { epoch: bookmarkCacheEpoch(), username }
}
export function saveBookmarkCache(
  config: NavigationConfig,
  scope: ReturnType<typeof captureBookmarkCacheScope>
) {
  if (!scope.username || scope.username !== username || scope.epoch !== bookmarkCacheEpoch()) return
  const snapshot = makeBookmarkSnapshot(config, location.href, scope.username)
  verified = snapshot
  try {
    localStorage.setItem(BOOKMARK_CACHE_KEY, JSON.stringify(snapshot))
    suppressed = false
  } catch {
    /* Quota/private mode: retain old snapshot. */
  }
  send('snapshot', snapshot)
  changed()
}
export function startBookmarkCacheBridge() {
  const receive = (event: MessageEvent) => {
    if (
      window.parent === window ||
      !(
        event.source === window.parent ||
        (event.source === null && location.ancestorOrigins?.[0] === event.origin)
      ) ||
      !/^chrome-extension:\/\/[a-p]{32}$/.test(event.origin) ||
      new URLSearchParams(location.search).get('embedded') !== '1'
    )
      return
    const message = event.data
    if (
      !message ||
      message.type !== CACHE_MESSAGE ||
      typeof message.nonce !== 'string' ||
      message.nonce.length > 100
    )
      return
    if (message.kind === 'connect') {
      bridge = { origin: event.origin, nonce: message.nonce }
      if (verified && verified.source === cacheSource(location.href)) send('snapshot', verified)
      else send(accessDenied ? 'denied' : username ? 'waiting' : 'connected')
    } else if (
      bridge?.origin === event.origin &&
      bridge.nonce === message.nonce &&
      message.kind === 'refresh'
    ) {
      window.dispatchEvent(new Event(BOOKMARK_CACHE_REFRESH))
    } else if (
      bridge?.origin === event.origin &&
      bridge.nonce === message.nonce &&
      message.kind === 'open'
    ) {
      window.dispatchEvent(
        new CustomEvent(BOOKMARK_CACHE_OPEN, {
          detail: {
            query: typeof message.query === 'string' ? message.query.slice(0, 2000) : '',
            sceneId: verified?.scenes.some((scene) => scene.id === message.sceneId)
              ? message.sceneId
              : undefined,
          },
        })
      )
    }
  }
  const storage = (event: StorageEvent) => {
    if (event.key !== BOOKMARK_CACHE_KEY && event.key !== EPOCH_KEY && event.key !== null) return
    if (event.key !== BOOKMARK_CACHE_KEY || event.newValue === null) verified = null
    suppressed = false
    if (event.key === EPOCH_KEY || event.key === null) {
      username = null
      send('clear')
    }
    changed()
  }
  window.addEventListener('message', receive)
  window.addEventListener('storage', storage)
  if (window.parent !== window && new URLSearchParams(location.search).get('embedded') === '1') {
    // No private data in this readiness notification. The subsequent handshake checks the parent.
    window.parent.postMessage({ type: CACHE_MESSAGE, kind: 'ready' }, '*')
  }
  return () => {
    window.removeEventListener('message', receive)
    window.removeEventListener('storage', storage)
    bridge = null
  }
}
