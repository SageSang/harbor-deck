import { describe, expect, it } from 'vitest'
import { navigationConfigSchema } from '../src/config/schema'
import { cacheSource, makeBookmarkSnapshot, parseBookmarkSnapshot } from './bookmarkSnapshot'
const config = navigationConfigSchema.parse({
  defaultSceneId: 'public',
  _revision: 'r1',
  bookmarks: [
    {
      slug: 'visible',
      name: 'Visible',
      primaryUrl: 'https://public.test/',
      probes: ['https://private-probe.test/'],
    },
    { slug: 'secret', name: 'SECRET', primaryUrl: 'https://secret.test/' },
    { slug: 'orphan', name: 'ORPHAN', primaryUrl: 'https://orphan.test/' },
  ],
  scenes: [
    {
      id: 'public',
      name: 'Public',
      groups: [{ id: 'main', name: 'Main', bookmarkIds: ['visible'] }],
      quickRecords: [
        { id: 'q', name: 'Note', primaryUrl: 'https://note.test/', createdAt: 1, updatedAt: 1 },
      ],
    },
    {
      id: 'private',
      name: 'PRIVATE',
      protected: true,
      passwordHash: 'HASH',
      groups: [{ id: 'secret', name: 'Secret', bookmarkIds: ['secret'] }],
    },
  ],
})
describe('safe navigation snapshots', () => {
  it('persists only ordinary referenced bookmarks and quick records, even after protected scenes unlock', () => {
    const snapshot = makeBookmarkSnapshot(config, 'https://deck.test/?embedded=1', 'owner')
    expect(snapshot.scenes).toHaveLength(1)
    expect(snapshot.scenes[0].groups.flatMap((g) => g.items).map((i) => i.name)).toEqual([
      'Visible',
      'Note',
    ])
    const text = JSON.stringify(snapshot)
    for (const secret of [
      'SECRET',
      'PRIVATE',
      'HASH',
      'ORPHAN',
      'private-probe',
      'passwordHash',
      'probes',
    ])
      expect(text).not.toContain(secret)
    expect(snapshot.source).toBe('https://deck.test/')
  })
  it('accepts an empty ordinary snapshot after deletion and rejects unsafe or incompatible input', () => {
    const snapshot = makeBookmarkSnapshot(
      { ...config, bookmarks: [], scenes: [] },
      'https://deck.test/',
      'owner'
    )
    expect(parseBookmarkSnapshot(snapshot)?.scenes).toEqual([])
    expect(parseBookmarkSnapshot({ ...snapshot, schemaVersion: 9 })).toBeNull()
    expect(parseBookmarkSnapshot(snapshot, 'https://other.test/')).toBeNull()
    expect(parseBookmarkSnapshot('{')).toBeNull()
    expect(
      parseBookmarkSnapshot({
        ...snapshot,
        scenes: [
          {
            id: 'x',
            name: 'X',
            groups: [
              {
                id: 'x',
                name: 'X',
                items: [{ id: 'x', name: 'X', primaryUrl: 'javascript:alert(1)' }],
              },
            ],
          },
        ],
      })
    ).toBeNull()
    expect(cacheSource('https://user:password@deck.test/')).toBe('')
  })
})
