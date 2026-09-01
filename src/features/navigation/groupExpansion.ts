import type { AppConfig, GroupExpansionPreference, NavigationConfig } from '../../config/schema.js'

export const GROUP_EXPANSION_PREFERENCE_VERSION = 1 as const

export function getGroupKey(sceneId: string, groupId: string) {
  return `${sceneId}:${groupId}`
}

export function getValidGroupKeys(navigation: NavigationConfig) {
  return new Set(
    navigation.scenes.flatMap((scene) =>
      scene.groups.map((group) => getGroupKey(scene.id, group.id))
    )
  )
}

export function cleanExpandedGroupKeys(navigation: NavigationConfig, keys: Iterable<string>) {
  const validKeys = getValidGroupKeys(navigation)
  return Array.from(new Set(keys)).filter((key) => validKeys.has(key))
}

export function createGroupExpansionPreference(
  navigation: NavigationConfig,
  keys: Iterable<string>
): GroupExpansionPreference {
  return {
    version: GROUP_EXPANSION_PREFERENCE_VERSION,
    expandedGroupKeys: cleanExpandedGroupKeys(navigation, keys),
  }
}

export function cleanAppGroupExpansionPreference(config: AppConfig): AppConfig {
  const preference = config.uiPreferences?.groupExpansion
  if (!preference) {
    return config
  }

  return {
    ...config,
    uiPreferences: {
      ...config.uiPreferences,
      groupExpansion: createGroupExpansionPreference(
        config.navigation,
        preference.expandedGroupKeys
      ),
    },
  }
}
