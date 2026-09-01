import type { NavigationConfig } from '@/config/schema'
import { getGroupKey } from '@/features/navigation/groupExpansion'

export const COLLAPSED_GROUPS_STORAGE_KEY = 'harbordeck-collapsed-groups'
export const LEGACY_COLLAPSED_GROUPS_STORAGE_KEY = ['smart', '-harbor-collapsed-groups'].join('')

export function readLegacyCollapsedGroupKeys(): string[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const stored =
      window.localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_COLLAPSED_GROUPS_STORAGE_KEY)
    const parsed: unknown = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) && parsed.every((value) => typeof value === 'string') ? parsed : []
  } catch {
    return []
  }
}

export function deriveLegacyExpandedGroupKeys(
  navigation: NavigationConfig,
  collapsedGroupKeys: Iterable<string>
) {
  const collapsedKeys = new Set(collapsedGroupKeys)

  return navigation.scenes.flatMap((scene) => {
    const sceneHasKnownCollapsedGroup = scene.groups.some((group) =>
      collapsedKeys.has(getGroupKey(scene.id, group.id))
    )
    if (!sceneHasKnownCollapsedGroup) {
      return []
    }

    return scene.groups
      .map((group) => getGroupKey(scene.id, group.id))
      .filter((key) => !collapsedKeys.has(key))
  })
}

export function clearLegacyCollapsedGroupKeys() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(COLLAPSED_GROUPS_STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_COLLAPSED_GROUPS_STORAGE_KEY)
  } catch {
    // Cleanup is best-effort after the server has accepted the migration.
  }
}
