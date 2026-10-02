import { describe, expect, it } from 'vitest'
import {
  makeBookmarkSnapshot,
  parseBookmarkSnapshot,
  snapshotDisplay,
} from '@shared/bookmarkSnapshot'
import { navigationConfigSchema, systemConfigSchema } from '@/config/schema'
import { sceneServices, snapshotNavigation } from './navigationView'
describe('real navigation UI cache projection', () => {
  it('preserves display/order/quick records, without a writable revision or protected data', () => {
    const nav = navigationConfigSchema.parse({
      _revision: 'live-only',
      defaultSceneId: 'home',
      bookmarks: [
        {
          slug: 'first',
          name: 'First',
          icon: 'star',
          primaryUrl: 'https://first.test/',
          forceNewTab: true,
        },
        { slug: 'secret', name: 'Secret', primaryUrl: 'https://secret.test/' },
      ],
      scenes: [
        {
          id: 'home',
          name: 'Home',
          groups: [{ id: 'tools', name: 'Tools', bookmarkIds: ['first'] }],
          quickRecords: [
            {
              id: 'quick',
              name: 'Quick',
              primaryUrl: 'https://quick.test/',
              createdAt: 1,
              updatedAt: 2,
              icon: 'home',
            },
          ],
        },
        {
          id: 'private',
          name: 'Private',
          protected: true,
          passwordHash: 'never-persist',
          groups: [{ id: 'g', name: 'G', bookmarkIds: ['secret'] }],
        },
      ],
    })
    const cache = makeBookmarkSnapshot(nav, 'https://deck.test/', 'owner')
    const display = snapshotNavigation(cache)!
    expect(display._revision).toBeUndefined()
    expect(display.bookmarks[0]).toMatchObject({ slug: 'first', icon: 'star', forceNewTab: true })
    expect(display.scenes[0].quickRecords[0]).toMatchObject({
      createdAt: 1,
      updatedAt: 2,
      icon: 'home',
    })
    expect(sceneServices(display, 'home')?.[0].items[0].slug).toBe('first')
    expect(JSON.stringify(cache)).not.toMatch(/never-persist|secret|Private/)
  })
  it('whitelists appearance and search preferences without credentials or system revision', () => {
    const system = systemConfigSchema.parse({
      _revision: 'secret-revision',
      auth: { username: 'owner', passwordHash: 'credential' },
      webdavBackup: { url: 'https://backup.test/', username: 'backup-owner', password: 'secret' },
      skin: 'frost',
      defaultSearchEngine: 'google',
    })
    expect(JSON.stringify(snapshotDisplay(system))).not.toMatch(
      /secret|credential|backup|_revision|auth/
    )
  })
  it('accepts legacy snapshots without appearance fields and handles an empty visible scene list', () => {
    const cache = parseBookmarkSnapshot({
      schemaVersion: 1,
      source: 'http://deck.test/',
      username: 'owner',
      updatedAt: 1,
      scenes: [],
    })
    expect(cache).not.toBeNull()
    expect(snapshotNavigation(cache)).toBeUndefined()
  })
})
