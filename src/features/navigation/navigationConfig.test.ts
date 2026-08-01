import { describe, expect, it } from 'vitest'
import {
  parseNavigationConfig,
  removeBookmarksFromScene,
  removeGroupFromScene,
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
