import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navigationConfigSchema } from '@/config/schema'
import { BOOKMARK_CACHE_KEY } from '@shared/bookmarkSnapshot'
const config = navigationConfigSchema.parse({
  defaultSceneId: 'main',
  _revision: 'r1',
  bookmarks: [{ slug: 'a', name: 'Alpha', primaryUrl: 'https://alpha.test/' }],
  scenes: [
    { id: 'main', name: 'Main', groups: [{ id: 'main', name: 'Main', bookmarkIds: ['a'] }] },
  ],
})
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function seeded() {
  const cache = await import('./bookmarkCache')
  cache.setBookmarkCacheUser('owner')
  cache.saveBookmarkCache(config, cache.captureBookmarkCacheScope())
  return cache
}
describe('web bookmark cache lifecycle', () => {
  it('retains the last good copy on network/HTTP/parse failure but replaces explicit deletion', async () => {
    const cache = await seeded()
    const api = await import('../config/api')
    const before = localStorage.getItem(BOOKMARK_CACHE_KEY)
    for (const response of [new Response('error', { status: 503 }), new Response('{bad')]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response)
      )
      await expect(api.fetchNavigationConfig()).rejects.toThrow()
      expect(localStorage.getItem(BOOKMARK_CACHE_KEY)).toBe(before)
    }
    cache.saveBookmarkCache(
      { ...config, bookmarks: [], scenes: config.scenes.map((s) => ({ ...s, groups: [] })) },
      cache.captureBookmarkCacheScope()
    )
    expect(cache.readBookmarkCache()?.scenes[0].groups).toEqual([])
  })
  it('drops a late navigation response after logout or a cache clear, keeping other user data', async () => {
    const cache = await seeded()
    localStorage.setItem('editing-draft', 'DO NOT DELETE')
    const scope = cache.captureBookmarkCacheScope()
    cache.clearBookmarkCache(true)
    cache.saveBookmarkCache(config, scope)
    expect(cache.readBookmarkCache()).toBeNull()
    expect(localStorage.getItem('editing-draft')).toBe('DO NOT DELETE')
    cache.setBookmarkCacheUser('next-user')
    cache.saveBookmarkCache(config, scope)
    expect(cache.readBookmarkCache()).toBeNull()
    cache.saveBookmarkCache(config, cache.captureBookmarkCacheScope())
    expect(cache.readBookmarkCache()?.username).toBe('next-user')
  })
  it('clears on authorization denial and never persists failed credentials', async () => {
    const cache = await seeded()
    const { fetchNavigationConfig } = await import('../config/api')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Forbidden', { status: 403 }))
    )
    await expect(fetchNavigationConfig()).rejects.toThrow('Forbidden')
    expect(cache.readBookmarkCache()).toBeNull()
  })
  it('tolerates quota failure and rejects an old request after another tab clears the cache', async () => {
    const cache = await seeded()
    const scope = cache.captureBookmarkCacheScope()
    const original = localStorage.getItem(BOOKMARK_CACHE_KEY)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => cache.saveBookmarkCache({ ...config, _revision: 'next' }, scope)).not.toThrow()
    expect(localStorage.getItem(BOOKMARK_CACHE_KEY)).toBe(original)
    vi.restoreAllMocks()
    localStorage.setItem(`${BOOKMARK_CACHE_KEY}:epoch`, 'other-tab-clear')
    localStorage.removeItem(BOOKMARK_CACHE_KEY)
    cache.saveBookmarkCache(config, scope)
    expect(cache.readBookmarkCache()).toBeNull()
  })
  it('never queues or sends an offline mutation', async () => {
    const api = await import('../config/api')
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await expect(api.saveNavigationConfig(config)).rejects.toThrow('not queued')
    expect(fetcher).not.toHaveBeenCalled()
  })
})

it('accepts Chromium null-source messages only from the actual extension ancestor', async () => {
  const cache = await seeded()
  const origin = 'chrome-extension://mlnpanpmgplmlangfnokhelkhkfcpine'
  const parent = { postMessage: vi.fn() }
  vi.stubGlobal('parent', parent)
  history.replaceState(null, '', '/?embedded=1')
  Object.defineProperty(location, 'ancestorOrigins', { configurable: true, value: [origin] })
  const stop = cache.startBookmarkCacheBridge()
  parent.postMessage.mockClear()
  const connect = (from: string) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: from,
        source: null,
        data: { type: 'harbordeck:bookmark-cache', kind: 'connect', nonce: 'fixture' },
      })
    )
  connect('chrome-extension://' + 'a'.repeat(32))
  connect('https://evil.test')
  expect(parent.postMessage).not.toHaveBeenCalled()
  connect(origin)
  expect(parent.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'snapshot', nonce: 'fixture' }),
    origin
  )
  stop()
  history.replaceState(null, '', '/')
})

it('does not let a late authorization failure erase a new account cache', async () => {
  const cache = await seeded()
  let reply!: (value: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          reply = resolve
        })
    )
  )
  const { fetchNavigationConfig } = await import('../config/api')
  const old = fetchNavigationConfig()
  const failure = expect(old).rejects.toThrow()
  await vi.waitFor(() => expect(reply).toBeTypeOf('function'))
  cache.setBookmarkCacheUser('new-owner')
  cache.saveBookmarkCache(config, cache.captureBookmarkCacheScope())
  reply(new Response('Expired old session', { status: 401 }))
  await failure
  expect(cache.readBookmarkCache()?.username).toBe('new-owner')
})

it('supports ordinary HTTP LAN pages where crypto.randomUUID is unavailable', async () => {
  vi.stubGlobal('crypto', {})
  const cache = await seeded()
  expect(cache.readBookmarkCache()).not.toBeNull()
  expect(() => cache.clearBookmarkCache(true)).not.toThrow()
  expect(cache.readBookmarkCache()).toBeNull()
})
