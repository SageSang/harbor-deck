import { describe, expect, it } from 'vitest'
import type { NavigationConfig } from '@/config/schema'
import { fillMissingBookmarkIcons, getMissingBookmarkIconCount } from './randomBookmarkIcon'

const navigation: NavigationConfig = {
  defaultSceneId: 'default',
  bookmarks: [
    { slug: 'missing', name: 'Missing', primaryUrl: 'https://missing.example' },
    { slug: 'kept', name: 'Kept', icon: 'star', primaryUrl: 'https://kept.example' },
    { slug: 'shared-locked', name: 'Locked', primaryUrl: 'https://locked.example' },
  ],
  scenes: [
    {
      id: 'default',
      name: 'Default',
      protected: false,
      groups: [{ id: 'main', name: 'Main', bookmarkIds: ['missing', 'kept', 'shared-locked'] }],
      quickRecords: [
        {
          id: 'quick-missing',
          name: 'Quick missing',
          primaryUrl: 'https://quick.example',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    },
    {
      id: 'private',
      name: 'Private',
      protected: true,
      groups: [{ id: 'private-main', name: 'Private', bookmarkIds: ['shared-locked'] }],
      quickRecords: [],
    },
  ],
}

describe('legacy bookmark icon migration', () => {
  it('fills only missing icons in editable scenes', () => {
    const editableSceneIds = new Set(['default', 'private'])
    const icons = ['bookmark', 'rocket']
    const result = fillMissingBookmarkIcons(navigation, {
      editableSceneIds,
      getIcon: () => icons.shift() ?? 'star',
    })

    expect(result.updatedCount).toBe(3)
    expect(result.config.bookmarks.map((bookmark) => bookmark.icon)).toEqual([
      'bookmark',
      'star',
      'rocket',
    ])
    expect(result.config.scenes[0].quickRecords[0].icon).toBe('star')
  })

  it('skips shared bookmarks referenced by a locked scene', () => {
    const editableSceneIds = new Set(['default'])

    expect(getMissingBookmarkIconCount(navigation, editableSceneIds)).toBe(2)
    const result = fillMissingBookmarkIcons(navigation, {
      editableSceneIds,
      getIcon: () => 'sparkles',
    })

    expect(result.updatedCount).toBe(2)
    expect(result.config.bookmarks.find((bookmark) => bookmark.slug === 'missing')?.icon).toBe(
      'sparkles'
    )
    expect(
      result.config.bookmarks.find((bookmark) => bookmark.slug === 'shared-locked')?.icon
    ).toBeUndefined()
  })
})
