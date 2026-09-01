import { describe, expect, it } from 'vitest'
import { appConfigSchema } from '@/config/schema'
import type { GroupExpansionSnapshot } from './groupExpansionApi'
import {
  applyGroupExpansion,
  applySceneGroupExpansion,
  isGroupCollapsedForView,
} from './groupExpansionState'

const snapshot: GroupExpansionSnapshot = {
  initialized: true,
  version: 1,
  expandedGroupKeys: ['work:apps'],
}

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
        groups: [{ id: 'apps', name: 'Apps', bookmarkIds: [] }],
      },
    ],
  },
}).navigation

describe('group expansion client state', () => {
  it('treats absent keys as collapsed and search matches as temporarily expanded', () => {
    const expandedKeys = new Set(snapshot.expandedGroupKeys)
    expect(isGroupCollapsedForView('personal', 'main', expandedKeys, false)).toBe(true)
    expect(isGroupCollapsedForView('work', 'apps', expandedKeys, false)).toBe(false)
    expect(isGroupCollapsedForView('personal', 'main', expandedKeys, true)).toBe(false)
  })

  it('optimistically updates only the requested group', () => {
    expect(applyGroupExpansion(snapshot, 'personal', 'main', true).expandedGroupKeys).toEqual([
      'work:apps',
      'personal:main',
    ])
    expect(applyGroupExpansion(snapshot, 'work', 'apps', false).expandedGroupKeys).toEqual([])
  })

  it('updates all groups in one scene without changing other scenes', () => {
    const expanded = applySceneGroupExpansion(snapshot, navigation, 'personal', true)
    expect(expanded.expandedGroupKeys).toEqual(['work:apps', 'personal:main', 'personal:tools'])

    expect(
      applySceneGroupExpansion(expanded, navigation, 'personal', false).expandedGroupKeys
    ).toEqual(['work:apps'])
  })
})
