import { describe, expect, it } from 'vitest'
import { appConfigSchema } from '@/config/schema'
import { promoteQuickRecords } from './promoteQuickRecords'

describe('quick record inbox', () => {
  it('promotes multiple records atomically, preserving URLs, notes and the snapshot revision', () => {
    const navigation = appConfigSchema.parse({
      navigation: {
        _revision: 'snapshot-a',
        defaultSceneId: 'main',
        bookmarks: [],
        scenes: [
          {
            id: 'main',
            name: 'Main',
            groups: [{ id: 'target', name: 'Target', bookmarkIds: [] }],
            quickRecords: [
              {
                id: 'one',
                name: 'First',
                primaryUrl: 'https://example.com/one',
                note: 'Remember this',
                createdAt: 1,
                updatedAt: 1,
              },
              {
                id: 'two',
                name: 'Second',
                primaryUrl: 'https://example.com/two',
                createdAt: 1,
                updatedAt: 1,
              },
            ],
          },
        ],
      },
    }).navigation
    const promoted = promoteQuickRecords(navigation, 'main', ['one', 'two'], 'target')
    expect(promoted._revision).toBe('snapshot-a')
    expect(promoted.scenes[0].quickRecords).toEqual([])
    expect(promoted.scenes[0].groups[0].bookmarkIds).toHaveLength(2)
    expect(promoted.bookmarks).toContainEqual(
      expect.objectContaining({ primaryUrl: 'https://example.com/one', note: 'Remember this' })
    )
    expect(navigation.scenes[0].quickRecords).toHaveLength(2)
    expect(() => promoteQuickRecords(navigation, 'main', ['one', 'missing'], 'target')).toThrow()
    expect(navigation.scenes[0].quickRecords).toHaveLength(2)
  })
})
