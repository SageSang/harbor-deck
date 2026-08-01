import { describe, expect, it } from 'vitest'
import type { NavigationConfig } from '@/config/schema'
import { createDuplicateBookmarkForm } from './bookmarkForm'

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
