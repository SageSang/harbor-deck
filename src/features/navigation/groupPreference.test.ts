import { beforeEach, describe, expect, it } from 'vitest'
import { appConfigSchema } from '@/config/schema'
import {
  clearLegacyCollapsedGroupKeys,
  COLLAPSED_GROUPS_STORAGE_KEY,
  deriveLegacyExpandedGroupKeys,
  LEGACY_COLLAPSED_GROUPS_STORAGE_KEY,
  readLegacyCollapsedGroupKeys,
} from './groupPreference'

const navigation = appConfigSchema.parse({
  navigation: {
    defaultSceneId: 'personal',
    bookmarks: [],
    scenes: [
      {
        id: 'personal',
        name: 'Personal',
        groups: [
          { id: 'main', name: 'Main', bookmarkIds: [] },
          { id: 'tools', name: 'Tools', bookmarkIds: [] },
        ],
      },
      {
        id: 'work',
        name: 'Work',
        groups: [
          { id: 'apps', name: 'Apps', bookmarkIds: [] },
          { id: 'docs', name: 'Docs', bookmarkIds: [] },
        ],
      },
    ],
  },
}).navigation

describe('legacy group preference migration', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it.each([
    ['missing', null],
    ['empty', '[]'],
    ['damaged', '{not-json'],
    ['wrong shape', '{"collapsed":[]}'],
  ])('migrates %s legacy state to all collapsed', (_label, stored) => {
    if (stored !== null) {
      window.localStorage.setItem(COLLAPSED_GROUPS_STORAGE_KEY, stored)
    }

    expect(deriveLegacyExpandedGroupKeys(navigation, readLegacyCollapsedGroupKeys())).toEqual([])
  })

  it('preserves the determinable state only for scenes with a collapsed key', () => {
    window.localStorage.setItem(
      COLLAPSED_GROUPS_STORAGE_KEY,
      JSON.stringify(['personal:main', 'missing:group'])
    )

    expect(deriveLegacyExpandedGroupKeys(navigation, readLegacyCollapsedGroupKeys())).toEqual([
      'personal:tools',
    ])
  })

  it('reads the current key first and clears both keys after migration', () => {
    window.localStorage.setItem(LEGACY_COLLAPSED_GROUPS_STORAGE_KEY, JSON.stringify(['work:docs']))
    window.localStorage.setItem(COLLAPSED_GROUPS_STORAGE_KEY, '[]')

    expect(readLegacyCollapsedGroupKeys()).toEqual([])

    clearLegacyCollapsedGroupKeys()
    expect(window.localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(LEGACY_COLLAPSED_GROUPS_STORAGE_KEY)).toBeNull()
  })
})
