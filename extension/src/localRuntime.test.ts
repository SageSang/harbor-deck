import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BOOKMARK_CACHE_KEY, type BookmarkSnapshot } from '@shared/bookmarkSnapshot'
import { STORAGE_KEY } from './storage'
import type { ExtensionSettings } from './types'
const settings: ExtensionSettings = {
  primaryUrl: 'http://lan.test/',
  fallbackUrl: 'https://wan.test/',
  apiToken: '',
  openMode: 'local',
  localExperienceVersion: 1,
  probeTimeoutMs: 200,
  settingsRevision: 'fixture',
}
const initial: BookmarkSnapshot = {
  schemaVersion: 1,
  source: settings.primaryUrl,
  username: 'owner',
  updatedAt: 1,
  scenes: [{ id: 'home', name: 'Home', groups: [] }],
}
let stored: Record<string, unknown>
let listener: (changes: Record<string, { newValue: unknown }>, area: string) => void
let set: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetModules()
  stored = { [STORAGE_KEY]: settings, [BOOKMARK_CACHE_KEY]: { epoch: 'old', snapshots: [initial] } }
  set = vi.fn(async (values: Record<string, unknown>) => {
    Object.assign(stored, values)
    listener?.(
      Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }])),
      'local'
    )
  })
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: async () => structuredClone(stored), set },
      onChanged: {
        addListener: (fn: typeof listener) => {
          listener = fn
        },
      },
    },
    runtime: { openOptionsPage: vi.fn() },
  })
  vi.stubGlobal('navigator', {
    language: 'en',
    locks: { request: async (_key: string, work: () => unknown) => work() },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const status = (authenticated = true) =>
  new Response(JSON.stringify({ authenticated, setupRequired: false }))
async function runtime() {
  const { installLocalRuntime } = await import('./localRuntime')
  const current = await installLocalRuntime(settings)
  return { current, ...(await import('@/lib/clientRuntime')) }
}
describe('local new-tab server and cache boundary', () => {
  it('exposes cache before any API or probe, without resetting the 200 ms user setting', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const app = await runtime()
    expect(JSON.parse(app.clientStorage().getItem(BOOKMARK_CACHE_KEY)!)).toEqual(initial)
    expect(fetch).not.toHaveBeenCalled()
    expect(stored[STORAGE_KEY]).toEqual(settings)
  })
  it('shares one initial read and uses the working authenticated address without health gating', async () => {
    const fetch = vi.fn(async (url: URL) => {
      if (url.host === 'lan.test') throw new TypeError('network')
      return status()
    })
    vi.stubGlobal('fetch', fetch)
    const app = await runtime()
    await Promise.all([app.prepareApi(), app.prepareApi(), app.prepareApi()])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(app.clientSource()).toBe(settings.fallbackUrl)
    expect(JSON.parse(app.clientStorage().getItem(BOOKMARK_CACHE_KEY)!)).toEqual(initial)
    expect(fetch.mock.calls.every(([url]) => url.pathname === '/api/auth/status')).toBe(true)
  })
  it('prefers an existing authenticated session over a faster login screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) => status(url.host === 'wan.test'))
    )
    const app = await runtime()
    await app.prepareApi()
    expect(app.clientSource()).toBe(settings.fallbackUrl)
  })
  it('uses a login/setup response when no configured address is authenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => status(false))
    )
    const app = await runtime()
    await app.prepareApi()
    expect(app.clientSource()).toBe(settings.primaryUrl)
  })
  it('serializes clear then new login cache, without restoring an older queued snapshot', async () => {
    const app = await runtime(),
      cache = app.clientStorage(),
      epoch = `${BOOKMARK_CACHE_KEY}:epoch`
    cache.setItem(BOOKMARK_CACHE_KEY, JSON.stringify({ ...initial, updatedAt: 2 }))
    cache.removeItem(BOOKMARK_CACHE_KEY)
    cache.setItem(epoch, 'logout')
    cache.setItem(
      BOOKMARK_CACHE_KEY,
      JSON.stringify({ ...initial, username: 'new-owner', updatedAt: 3 })
    )
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(3))
    expect(stored[BOOKMARK_CACHE_KEY]).toMatchObject({
      epoch: 'logout',
      snapshots: [{ username: 'new-owner', updatedAt: 3 }],
    })
  })
  it('recognizes another tab revocation and refuses stale queued writes', async () => {
    const app = await runtime(),
      event = vi.fn()
    window.addEventListener('harbordeck-cache-revoked', event, { once: true })
    app.clientStorage().setItem(BOOKMARK_CACHE_KEY, JSON.stringify({ ...initial, updatedAt: 2 }))
    stored[BOOKMARK_CACHE_KEY] = { epoch: 'other-tab-logout', accessLost: true, snapshots: [] }
    listener({ [BOOKMARK_CACHE_KEY]: { newValue: stored[BOOKMARK_CACHE_KEY] } }, 'local')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(event).toHaveBeenCalledOnce()
    expect(app.clientStorage().getItem(BOOKMARK_CACHE_KEY)).toBeNull()
    expect(stored[BOOKMARK_CACHE_KEY]).toEqual({
      epoch: 'other-tab-logout',
      accessLost: true,
      snapshots: [],
    })
  })
  it('freezes the old page binding on settings change, never sends a write to the replacement server', async () => {
    const fetch = vi.fn(async () => status())
    vi.stubGlobal('fetch', fetch)
    const app = await runtime()
    await app.prepareApi()
    fetch.mockClear()
    stored[STORAGE_KEY] = {
      ...settings,
      primaryUrl: 'https://other.test/',
      settingsRevision: 'new',
    }
    listener({ [STORAGE_KEY]: { newValue: stored[STORAGE_KEY] } }, 'local')
    await expect(app.fetchApi('/api/config/navigation', { method: 'PUT' })).rejects.toThrow(
      'Connection changed'
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(app.clientStorage().getItem(BOOKMARK_CACHE_KEY)).toBeNull()
  })
  it('treats corrupt or unavailable persistent storage as optional', async () => {
    stored[BOOKMARK_CACHE_KEY] = {
      epoch: 'old',
      snapshots: [{ ...initial, source: 'https://evil.test/' }, { bad: true }],
    }
    const app = await runtime()
    expect(app.clientStorage().getItem(BOOKMARK_CACHE_KEY)).toBeNull()
    set.mockRejectedValue(new Error('quota'))
    app.clientStorage().setItem(BOOKMARK_CACHE_KEY, JSON.stringify(initial))
    await vi.waitFor(() => expect(set).toHaveBeenCalledOnce())
    expect(JSON.parse(app.clientStorage().getItem(BOOKMARK_CACHE_KEY)!)).toEqual(initial)
  })
})
