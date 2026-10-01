import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BOOKMARK_CACHE_KEY, type BookmarkSnapshot } from '@shared/bookmarkSnapshot'
import { changeBookmarkCache, readBookmarkCaches } from './bookmarkCache'
import { createSettingsCoordinator } from './settingsCoordinator'
import { STORAGE_KEY } from './storage'
import type { ExtensionSettings } from './types'
const settings: ExtensionSettings = {
  primaryUrl: 'https://deck.test/',
  fallbackUrl: 'https://backup.test/',
  apiToken: '',
  openMode: 'embedded',
  probeTimeoutMs: 1000,
  settingsRevision: 'one',
}
const snapshot: BookmarkSnapshot = {
  schemaVersion: 1,
  source: settings.primaryUrl,
  username: 'owner',
  updatedAt: 1,
  scenes: [],
}
let values: Record<string, unknown>
beforeEach(() => {
  values = { [STORAGE_KEY]: settings, draft: 'KEEP' }
  let tail = Promise.resolve<unknown>(undefined)
  vi.stubGlobal('navigator', {
    language: 'en',
    locks: {
      request: (_: string, work: () => Promise<unknown>) => {
        const next = tail.then(work)
        tail = next.catch(() => undefined)
        return next
      },
    },
  })
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (keys: string | string[]) =>
          Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((k) => [k, values[k]])),
        set: async (data: Record<string, unknown>) => {
          Object.assign(values, data)
        },
      },
    },
  })
})
afterEach(() => vi.unstubAllGlobals())
describe('extension cache scope and ordering', () => {
  it('keeps at most the configured addresses and rejects a message from another address', async () => {
    expect(await changeBookmarkCache(settings, '', settings.primaryUrl, snapshot)).toBe(true)
    expect(
      await changeBookmarkCache(settings, '', settings.fallbackUrl, {
        ...snapshot,
        source: settings.fallbackUrl,
      })
    ).toBe(true)
    expect(
      await changeBookmarkCache(settings, '', 'https://wrong.test/', {
        ...snapshot,
        source: 'https://wrong.test/',
      })
    ).toBe(false)
    expect(
      await changeBookmarkCache(settings, '', settings.primaryUrl, {
        ...snapshot,
        source: settings.fallbackUrl,
      })
    ).toBe(false)
    expect((await readBookmarkCaches(settings)).snapshots).toHaveLength(2)
  })
  it('clear wins against a late snapshot without deleting drafts or settings', async () => {
    await changeBookmarkCache(settings, '', settings.primaryUrl, snapshot)
    await changeBookmarkCache(settings, '', settings.primaryUrl, null)
    expect(await changeBookmarkCache(settings, '', settings.primaryUrl, snapshot)).toBe(false)
    expect((await readBookmarkCaches(settings)).snapshots).toEqual([])
    expect(values.draft).toBe('KEEP')
    expect(values[STORAGE_KEY]).toEqual(settings)
  })
  it('prunes changed addresses atomically with settings and refuses old settings writers', async () => {
    await changeBookmarkCache(settings, '', settings.primaryUrl, snapshot)
    await changeBookmarkCache(settings, '', settings.fallbackUrl, {
      ...snapshot,
      source: settings.fallbackUrl,
    })
    const next = await createSettingsCoordinator().save({
      ...settings,
      primaryUrl: 'https://new.test/',
    })
    expect((await readBookmarkCaches(next)).snapshots.map((s) => s.source)).toEqual([
      settings.fallbackUrl,
    ])
    expect(await changeBookmarkCache(settings, '', settings.primaryUrl, snapshot)).toBe(false)
    expect(JSON.stringify(values[BOOKMARK_CACHE_KEY])).not.toContain(settings.primaryUrl)
  })
})
