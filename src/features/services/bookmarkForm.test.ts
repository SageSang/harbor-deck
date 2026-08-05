import { describe, expect, it } from 'vitest'
import type { NavigationConfig } from '@/config/schema'
import {
  createDuplicateBookmarkForm,
  createEmptyBookmarkForm,
  validateQuickRecordForm,
} from './bookmarkForm'

function createNavigationConfig(): NavigationConfig {
  return {
    defaultSceneId: 'personal',
    bookmarks: [
      {
        slug: 'dashboard',
        name: 'Dashboard',
        icon: 'layout-dashboard',
        primaryUrl: 'http://dashboard.lan',
        secondaryUrl: 'https://dashboard.example.com',
        forceNewTab: true,
      },
      {
        slug: 'dashboard-copy',
        name: 'Existing copy',
        primaryUrl: 'https://example.com',
      },
    ],
    scenes: [
      {
        id: 'personal',
        name: 'Personal',
        protected: false,
        groups: [
          {
            id: 'common',
            name: 'Common',
            bookmarkIds: ['dashboard'],
          },
        ],
        quickRecords: [],
      },
      {
        id: 'work',
        name: 'Work',
        protected: false,
        groups: [
          {
            id: 'tools',
            name: 'Tools',
            bookmarkIds: ['dashboard'],
          },
        ],
        quickRecords: [],
      },
    ],
  }
}

describe('createDuplicateBookmarkForm', () => {
  it('copies bookmark fields and placements while generating a unique slug', () => {
    const config = createNavigationConfig()
    const source = config.bookmarks[0]

    const result = createDuplicateBookmarkForm(config, source)

    expect(result).toEqual({
      placements: [
        { sceneId: 'personal', groupId: 'common', newGroupName: '' },
        { sceneId: 'work', groupId: 'tools', newGroupName: '' },
      ],
      name: 'Dashboard',
      slug: 'dashboard-copy-2',
      icon: 'layout-dashboard',
      primaryUrl: 'http://dashboard.lan',
      secondaryUrl: 'https://dashboard.example.com',
      forceNewTab: true,
    })
  })
})

describe('quick record form submission', () => {
  it('allows an empty placement list while retaining the bookmark fields', () => {
    const config = createNavigationConfig()
    const values = createEmptyBookmarkForm(config, 'personal', null, { withoutPlacement: true })

    expect(values.placements).toEqual([])

    const result = validateQuickRecordForm(configureQuickRecord(values))

    expect(result.bookmark.name).toBe('快速记录测试')
    expect(result.bookmark.primaryUrl).toBe('https://quick-record.example.com')
  })

  it('does not apply the normal bookmark slug rules', () => {
    const config = createNavigationConfig()
    const values = {
      ...createEmptyBookmarkForm(config, 'personal', null, { withoutPlacement: true }),
      name: 'Another quick record',
      slug: 'not a valid bookmark slug',
      primaryUrl: 'https://another-quick-record.example.com',
    }

    const result = validateQuickRecordForm(values)

    expect(result.bookmark.slug).toBe('quick-record')
    expect(result.bookmark.name).toBe('Another quick record')
  })
})

function configureQuickRecord(values: ReturnType<typeof createEmptyBookmarkForm>) {
  return {
    ...values,
    name: '快速记录测试',
    primaryUrl: 'https://quick-record.example.com',
  }
}
