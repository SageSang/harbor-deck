import { describe, expect, it } from 'vitest'
import type { ServicesConfig } from '@/config/schema'
import { parseNavigationConfig } from '@/features/navigation/navigationConfig'
import { validateBookmarkForm } from '@/features/services/bookmarkForm'
import {
  moveGroup,
  moveService,
  slugify,
  validateGroupName,
} from '@/features/services/servicesConfig'

const sampleConfig: ServicesConfig = [
  {
    category: 'Services',
    items: [
      {
        slug: 'alpha',
        name: 'Alpha',
        primaryUrl: 'http://127.0.0.1:3000',
        secondaryUrl: 'https://alpha.example.com',
      },
      {
        slug: 'beta',
        name: 'Beta',
        primaryUrl: 'http://127.0.0.1:3001',
        secondaryUrl: 'https://beta.example.com',
      },
    ],
  },
  {
    category: 'Tools',
    items: [
      {
        slug: 'gamma',
        name: 'Gamma',
        primaryUrl: 'http://127.0.0.1:3002',
        secondaryUrl: 'https://gamma.example.com',
      },
    ],
  },
]

const navigationConfig = parseNavigationConfig({
  defaultSceneId: 'default',
  bookmarks: sampleConfig.flatMap((group) => group.items),
  scenes: [
    {
      id: 'default',
      name: 'Default',
      protected: false,
      groups: sampleConfig.map((group, index) => ({
        id: `group-${index}`,
        name: group.category,
        bookmarkIds: group.items.map((item) => item.slug),
      })),
    },
  ],
})

describe('servicesConfig helpers', () => {
  it('transliterates bookmark names to slugs', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('falls back when a name cannot produce a slug', () => {
    expect(slugify('!!!', 'service-4')).toBe('service-4')
  })

  it('validates and de-duplicates group names', () => {
    expect(validateGroupName('  New Group  ', sampleConfig)).toBe('New Group')
    expect(() => validateGroupName('Tools', sampleConfig)).toThrow()
  })

  it('moves groups by index order', () => {
    const nextConfig = moveGroup(sampleConfig, 0, 1)
    expect(nextConfig.map((group) => group.category)).toEqual(['Tools', 'Services'])
    expect(nextConfig[1].items.map((item) => item.slug)).toEqual(['alpha', 'beta'])
  })

  it('moves bookmarks within and across groups', () => {
    const within = moveService(sampleConfig, { groupIndex: 0, serviceIndex: 0 }, 0, 2)
    expect(within[0].items.map((item) => item.slug)).toEqual(['beta', 'alpha'])

    const across = moveService(sampleConfig, { groupIndex: 0, serviceIndex: 1 }, 1, 1)
    expect(across[0].items.map((item) => item.slug)).toEqual(['alpha'])
    expect(across[1].items.map((item) => item.slug)).toEqual(['gamma', 'beta'])
  })
})

describe('validateBookmarkForm', () => {
  it('creates a group placement when the scene has no groups', () => {
    const emptyConfig = parseNavigationConfig({
      ...navigationConfig,
      bookmarks: [],
      scenes: [{ ...navigationConfig.scenes[0], groups: [] }],
    })
    const result = validateBookmarkForm(
      {
        placements: [{ sceneId: 'default', groupId: '', newGroupName: '  Common  ' }],
        name: 'New bookmark',
        slug: 'new-item',
        icon: '',
        primaryUrl: 'http://127.0.0.1:8080',
        secondaryUrl: 'https://example.com',
        forceNewTab: false,
      },
      emptyConfig
    )

    expect(result.groupsToCreate).toEqual([{ sceneId: 'default', name: 'Common' }])
    expect(result.placements[0].sceneId).toBe('default')
    expect(result.bookmark.slug).toBe('new-item')
    expect(result.bookmark.forceNewTab).toBeUndefined()
  })

  it('keeps forceNewTab when enabled', () => {
    const result = validateBookmarkForm(
      {
        placements: [{ sceneId: 'default', groupId: 'group-0', newGroupName: '' }],
        name: 'Bitwarden',
        slug: 'bitwarden',
        icon: '',
        primaryUrl: 'http://127.0.0.1:8080',
        secondaryUrl: 'https://vault.example.com',
        forceNewTab: true,
      },
      navigationConfig
    )

    expect(result.bookmark.forceNewTab).toBe(true)
  })

  it('suggests a slug from the bookmark name', () => {
    const result = validateBookmarkForm(
      {
        placements: [{ sceneId: 'default', groupId: 'group-0', newGroupName: '' }],
        name: 'Test Bookmark',
        slug: '',
        icon: '',
        primaryUrl: 'http://127.0.0.1:8080',
        secondaryUrl: 'https://example.com',
        forceNewTab: false,
      },
      navigationConfig
    )

    expect(result.bookmark.slug).toBe('test-bookmark')
  })

  it('allows the current slug when editing but rejects other duplicates', () => {
    const edited = validateBookmarkForm(
      {
        placements: [{ sceneId: 'default', groupId: 'group-0', newGroupName: '' }],
        name: 'Renamed bookmark',
        slug: 'beta',
        icon: '',
        primaryUrl: 'http://127.0.0.1:3001',
        secondaryUrl: 'https://beta.example.com',
        forceNewTab: false,
      },
      navigationConfig,
      { currentSlug: 'beta' }
    )
    expect(edited.bookmark.slug).toBe('beta')

    expect(() =>
      validateBookmarkForm(
        {
          placements: [{ sceneId: 'default', groupId: 'group-0', newGroupName: '' }],
          name: 'Duplicate',
          slug: 'alpha',
          icon: '',
          primaryUrl: 'http://127.0.0.1:8080',
          secondaryUrl: 'https://example.com',
          forceNewTab: false,
        },
        navigationConfig
      )
    ).toThrow()
  })
})
