import { describe, expect, it } from 'vitest'
import {
  addBookmarksToSceneGroups,
  moveBookmarksInScene,
  getBookmarkPlacementConflicts,
  parseNavigationConfig,
  renameGroupInScene,
  removeBookmarksFromScene,
  removeGroupFromScene,
  upsertBookmark,
} from '@/features/navigation/navigationConfig'

function createNavigationConfig() {
  return parseNavigationConfig({
    defaultSceneId: 'personal',
    bookmarks: [
      { slug: 'shared', name: 'Shared', primaryUrl: 'https://shared.example.com' },
      { slug: 'personal-only', name: 'Personal', primaryUrl: 'https://personal.example.com' },
      { slug: 'work-only', name: 'Work', primaryUrl: 'https://work.example.com' },
      { slug: 'unrelated-orphan', name: 'Orphan', primaryUrl: 'https://orphan.example.com' },
    ],
    scenes: [
      {
        id: 'personal',
        name: 'Personal',
        protected: false,
        groups: [
          {
            id: 'personal-main',
            name: 'Main',
            bookmarkIds: ['shared', 'personal-only'],
          },
        ],
      },
      {
        id: 'work',
        name: 'Work',
        protected: false,
        groups: [
          {
            id: 'work-main',
            name: 'Main',
            bookmarkIds: ['shared', 'work-only'],
          },
        ],
      },
    ],
  })
}

describe('navigation removal helpers', () => {
  it('deletes a group, preserves shared bookmarks, and removes newly orphaned bookmarks', () => {
    const result = removeGroupFromScene(createNavigationConfig(), 'personal', 'personal-main')

    expect(result.scenes.find((scene) => scene.id === 'personal')?.groups).toEqual([])
    expect(result.scenes.find((scene) => scene.id === 'work')?.groups[0].bookmarkIds).toEqual([
      'shared',
      'work-only',
    ])
    expect(result.bookmarks.map((bookmark) => bookmark.slug)).toEqual([
      'shared',
      'work-only',
      'unrelated-orphan',
    ])
  })

  it('batch-removes only current-scene references and prunes selected orphans', () => {
    const result = removeBookmarksFromScene(createNavigationConfig(), 'personal', [
      'shared',
      'personal-only',
    ])

    expect(result.scenes.find((scene) => scene.id === 'personal')?.groups[0].bookmarkIds).toEqual(
      []
    )
    expect(result.scenes.find((scene) => scene.id === 'work')?.groups[0].bookmarkIds).toEqual([
      'shared',
      'work-only',
    ])
    expect(result.bookmarks.map((bookmark) => bookmark.slug)).toEqual([
      'shared',
      'work-only',
      'unrelated-orphan',
    ])
  })

  it('does not change the config when the target group does not exist', () => {
    const config = createNavigationConfig()
    expect(removeGroupFromScene(config, 'personal', 'missing')).toEqual(config)
  })
})

describe('moveBookmarksInScene', () => {
  it('moves bookmarks from multiple groups as one ordered block', () => {
    const config = parseNavigationConfig({
      defaultSceneId: 'personal',
      bookmarks: ['a', 'b', 'c', 'd', 'e'].map((slug) => ({
        slug,
        name: slug.toUpperCase(),
        primaryUrl: `https://${slug}.example.com`,
      })),
      scenes: [
        {
          id: 'personal',
          name: 'Personal',
          protected: false,
          groups: [
            { id: 'first', name: 'First', bookmarkIds: ['a', 'b', 'c'] },
            { id: 'second', name: 'Second', bookmarkIds: ['d', 'e'] },
          ],
        },
      ],
    })

    const result = moveBookmarksInScene(config, 'personal', ['d', 'b'], 'second', 1)
    const groups = result.scenes[0].groups

    expect(groups[0].bookmarkIds).toEqual(['a', 'c'])
    expect(groups[1].bookmarkIds).toEqual(['b', 'd', 'e'])
  })

  it('keeps selected bookmark order when moving within the same group', () => {
    const config = parseNavigationConfig({
      defaultSceneId: 'personal',
      bookmarks: ['a', 'b', 'c', 'd'].map((slug) => ({
        slug,
        name: slug.toUpperCase(),
        primaryUrl: `https://${slug}.example.com`,
      })),
      scenes: [
        {
          id: 'personal',
          name: 'Personal',
          protected: false,
          groups: [{ id: 'main', name: 'Main', bookmarkIds: ['a', 'b', 'c', 'd'] }],
        },
      ],
    })

    const result = moveBookmarksInScene(config, 'personal', ['a', 'c'], 'main')

    expect(result.scenes[0].groups[0].bookmarkIds).toEqual(['b', 'd', 'a', 'c'])
  })
})

describe('renameGroupInScene', () => {
  it('renames only the requested scene group', () => {
    const config = createNavigationConfig()

    const result = renameGroupInScene(config, 'personal', 'personal-main', 'Favorites')

    expect(result.scenes.find((scene) => scene.id === 'personal')?.groups[0].name).toBe('Favorites')
    expect(result.scenes.find((scene) => scene.id === 'work')?.groups[0].name).toBe('Main')
  })
})

describe('bookmark placement updates', () => {
  it('keeps edited bookmark positions and inserts duplicates after the source', () => {
    const config = parseNavigationConfig({
      defaultSceneId: 'personal',
      bookmarks: [
        { slug: 'a', name: 'A', primaryUrl: 'https://a.example.com' },
        { slug: 'b', name: 'B', primaryUrl: 'https://b.example.com' },
        { slug: 'c', name: 'C', primaryUrl: 'https://c.example.com' },
      ],
      scenes: [
        {
          id: 'personal',
          name: 'Personal',
          protected: false,
          groups: [{ id: 'main', name: 'Main', bookmarkIds: ['a', 'b', 'c'] }],
        },
      ],
    })

    const edited = upsertBookmark(
      config,
      { slug: 'b', name: 'B updated', primaryUrl: 'https://b.example.com' },
      [{ sceneId: 'personal', groupId: 'main' }],
      'b',
      { preserveExistingPlacement: true }
    )
    expect(edited.scenes[0].groups[0].bookmarkIds).toEqual(['a', 'b', 'c'])

    const duplicate = upsertBookmark(
      config,
      { slug: 'b-copy', name: 'B copy', primaryUrl: 'https://b.example.com/copy' },
      [{ sceneId: 'personal', groupId: 'main' }],
      undefined,
      { insertAfterBookmarkId: 'b' }
    )
    expect(duplicate.scenes[0].groups[0].bookmarkIds).toEqual(['a', 'b', 'b-copy', 'c'])
  })

  it('reports same-scene conflicts and can move selected bookmarks to target groups', () => {
    const config = parseNavigationConfig({
      defaultSceneId: 'personal',
      bookmarks: [
        { slug: 'a', name: 'A', primaryUrl: 'https://a.example.com' },
        { slug: 'b', name: 'B', primaryUrl: 'https://b.example.com' },
      ],
      scenes: [
        {
          id: 'personal',
          name: 'Personal',
          protected: false,
          groups: [
            { id: 'first', name: 'First', bookmarkIds: ['a'] },
            { id: 'second', name: 'Second', bookmarkIds: ['b'] },
          ],
        },
      ],
    })
    const placements = [{ sceneId: 'personal', groupId: 'second' }]
    expect(getBookmarkPlacementConflicts(config, ['a', 'b'], placements)).toHaveLength(1)
    const result = addBookmarksToSceneGroups(config, ['a', 'b'], placements, true)
    expect(result.scenes[0].groups[0].bookmarkIds).toEqual([])
    expect(result.scenes[0].groups[1].bookmarkIds).toEqual(['b', 'a'])
  })
})
