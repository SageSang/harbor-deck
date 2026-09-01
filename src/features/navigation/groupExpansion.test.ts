import { describe, expect, it } from 'vitest'
import { appConfigSchema } from '@/config/schema'
import {
  cleanAppGroupExpansionPreference,
  cleanExpandedGroupKeys,
  createGroupExpansionPreference,
  getGroupKey,
} from './groupExpansion'

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
    ],
  },
}).navigation

describe('group expansion preference helpers', () => {
  it('builds stable scene and group keys', () => {
    expect(getGroupKey('personal', 'main')).toBe('personal:main')
  })

  it('deduplicates keys and removes unknown groups', () => {
    expect(
      cleanExpandedGroupKeys(navigation, ['personal:main', 'personal:missing', 'personal:main'])
    ).toEqual(['personal:main'])
  })

  it('keeps an absent preference uninitialized and cleans an existing one', () => {
    const baseConfig = appConfigSchema.parse({ navigation })
    expect(cleanAppGroupExpansionPreference(baseConfig).uiPreferences).toBeUndefined()

    const cleaned = cleanAppGroupExpansionPreference({
      ...baseConfig,
      uiPreferences: {
        groupExpansion: createGroupExpansionPreference(navigation, [
          'personal:tools',
          'personal:missing',
        ]),
      },
    })

    expect(cleaned.uiPreferences?.groupExpansion).toEqual({
      version: 1,
      expandedGroupKeys: ['personal:tools'],
    })
  })
})
