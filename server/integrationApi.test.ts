// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest'
import { parseNavigationConfig } from '../src/features/navigation/navigationConfig.js'
import {
  createIntegrationBookmark,
  isIntegrationTokenValid,
  lookupIntegrationBookmark,
  searchNavigationBookmarks,
} from './integrationApi.js'

const navigation = parseNavigationConfig({
  defaultSceneId: 'default',
  bookmarks: [
    {
      slug: 'harbor',
      name: 'Harbor Admin',
      primaryUrl: 'http://192.168.1.2:8080',
      secondaryUrl: 'https://harbor.example.com',
      note: 'private dashboard',
    },
    { slug: 'public', name: 'Public Tool', primaryUrl: 'https://public.example.com' },
  ],
  scenes: [
    {
      id: 'default',
      name: 'Default',
      protected: false,
      groups: [{ id: 'tools', name: 'Tools', bookmarkIds: ['harbor', 'public'] }],
    },
    {
      id: 'private',
      name: 'Private',
      protected: true,
      passwordHash: 'hash',
      groups: [{ id: 'private-tools', name: 'Private Tools', bookmarkIds: ['harbor'] }],
    },
  ],
})

describe('integrationApi', () => {
  afterEach(() => {
    delete process.env.HARBORDECK_SEARCH_TOKEN
  })

  it('requires the configured token and compares it safely', () => {
    process.env.HARBORDECK_SEARCH_TOKEN = 'secret-token'
    expect(isIntegrationTokenValid('wrong')).toBe(false)
    expect(isIntegrationTokenValid('secret-token')).toBe(true)
  })

  it('searches unlocked scenes and prefers the secondary URL', () => {
    const results = searchNavigationBookmarks(navigation, 'har')
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ sceneId: 'default', name: 'Harbor Admin', url: 'https://harbor.example.com' })
    expect(searchNavigationBookmarks(navigation, 'har', 'private')).toEqual([])
  })

  it('returns existing public metadata and placements without exposing private-only bookmarks', () => {
    expect(lookupIntegrationBookmark(navigation, 'https://harbor.example.com')).toEqual({
      bookmark: {
        name: 'Harbor Admin',
        primaryUrl: 'http://192.168.1.2:8080',
        secondaryUrl: 'https://harbor.example.com',
        note: 'private dashboard',
      },
      placements: [{ sceneId: 'default', groupId: 'tools' }],
    })

    const privateOnly = parseNavigationConfig({
      defaultSceneId: 'default',
      bookmarks: [
        { slug: 'secret', name: 'Secret', primaryUrl: 'https://secret.example.com' },
      ],
      scenes: [
        {
          id: 'default',
          name: 'Default',
          protected: false,
          groups: [{ id: 'tools', name: 'Tools', bookmarkIds: [] }],
        },
        {
          id: 'private',
          name: 'Private',
          protected: true,
          passwordHash: 'hash',
          groups: [{ id: 'private-tools', name: 'Private Tools', bookmarkIds: ['secret'] }],
        },
      ],
    })
    expect(lookupIntegrationBookmark(privateOnly, 'https://secret.example.com')).toEqual({
      bookmark: null,
      placements: [],
    })
  })

  it('adds to unlocked targets without changing an existing URL title', () => {
    const result = createIntegrationBookmark(navigation, {
      name: 'Different title',
      primaryUrl: 'http://192.168.1.2:8080',
      placements: [{ sceneId: 'default', groupId: 'tools' }],
    })
    expect(result.created).toBe(false)
    expect(result.bookmark.name).toBe('Harbor Admin')

    const merged = createIntegrationBookmark(navigation, {
      name: 'Ignored title',
      primaryUrl: 'http://192.168.1.2:8080',
      secondaryUrl: 'https://new-harbor.example.com',
      note: 'private dashboard',
      placements: [{ sceneId: 'default', groupId: 'tools' }],
    })
    expect(merged.bookmark.secondaryUrl).toBe('https://harbor.example.com')
    expect(merged.bookmark.note).toBe('private dashboard')

    const privateExisting = parseNavigationConfig({
      defaultSceneId: 'default',
      bookmarks: [
        { slug: 'secret', name: 'Private title', primaryUrl: 'https://secret.example.com' },
      ],
      scenes: [
        {
          id: 'default',
          name: 'Default',
          protected: false,
          groups: [{ id: 'tools', name: 'Tools', bookmarkIds: [] }],
        },
        {
          id: 'private',
          name: 'Private',
          protected: true,
          passwordHash: 'hash',
          groups: [{ id: 'private-tools', name: 'Private Tools', bookmarkIds: ['secret'] }],
        },
      ],
    })
    const privateMerge = createIntegrationBookmark(privateExisting, {
      name: 'New title is ignored',
      primaryUrl: 'https://secret.example.com',
      secondaryUrl: 'https://secret.example.com/remote',
      note: 'Added note',
      placements: [{ sceneId: 'default', groupId: 'tools' }],
    })
    expect(privateMerge.bookmark).toMatchObject({
      name: 'Private title',
      secondaryUrl: 'https://secret.example.com/remote',
      note: 'Added note',
    })

    expect(() =>
      createIntegrationBookmark(navigation, {
        name: 'Private',
        primaryUrl: 'https://new.example.com',
        placements: [{ sceneId: 'private', groupId: 'private-tools' }],
      })
    ).toThrow()
  })

  it('saves an empty-placement request as a searchable quick record and converts it', () => {
    const saved = createIntegrationBookmark(navigation, {
      name: 'Scratch note',
      primaryUrl: 'https://scratch.example.com',
      recordSceneId: 'default',
      placements: [],
    })
    expect(saved.created).toBe(true)
    expect(saved.quickRecord?.name).toBe('Scratch note')
    expect(searchNavigationBookmarks(saved.navigation, 'scratch')).toMatchObject([
      { recordId: saved.quickRecord?.id, name: 'Scratch note' },
    ])
    expect(lookupIntegrationBookmark(saved.navigation, 'https://scratch.example.com')).toMatchObject({
      quickRecord: { name: 'Scratch note', sceneId: 'default' },
    })

    const converted = createIntegrationBookmark(saved.navigation, {
      name: 'Scratch note',
      primaryUrl: 'https://scratch.example.com',
      placements: [{ sceneId: 'default', groupId: 'tools' }],
    })
    expect(converted.bookmark?.name).toBe('Scratch note')
    expect(converted.navigation.scenes[0].quickRecords).toHaveLength(0)
    expect(converted.navigation.scenes[0].groups[0].bookmarkIds).toContain(converted.bookmark?.slug)
  })

  it('updates quick-record metadata and stops matching removed or internal text', () => {
    const saved = createIntegrationBookmark(navigation, {
      name: 'Original keyword',
      primaryUrl: 'https://rename.example.com/current',
      note: 'removed note keyword',
      recordSceneId: 'default',
      placements: [],
    })
    const updated = createIntegrationBookmark(saved.navigation, {
      name: 'Current title',
      primaryUrl: 'https://rename.example.com/current',
      recordSceneId: 'default',
      placements: [],
    })

    expect(updated.created).toBe(false)
    expect(updated.quickRecord).toMatchObject({
      id: saved.quickRecord?.id,
      name: 'Current title',
      primaryUrl: 'https://rename.example.com/current',
    })
    expect(updated.quickRecord?.note).toBeUndefined()
    expect(searchNavigationBookmarks(updated.navigation, 'original keyword')).toEqual([])
    expect(searchNavigationBookmarks(updated.navigation, 'removed note keyword')).toEqual([])
    expect(searchNavigationBookmarks(updated.navigation, 'quick-')).toEqual([])
    expect(searchNavigationBookmarks(updated.navigation, 'current title')).toHaveLength(1)
  })
})
