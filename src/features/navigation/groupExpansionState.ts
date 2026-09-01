import type { NavigationConfig } from '@/config/schema'
import type { GroupExpansionSnapshot } from '@/features/navigation/groupExpansionApi'
import { getGroupKey } from '@/features/navigation/groupExpansion'

export function applyGroupExpansion(
  snapshot: GroupExpansionSnapshot,
  sceneId: string,
  groupId: string,
  expanded: boolean
): GroupExpansionSnapshot {
  const key = getGroupKey(sceneId, groupId)
  const expandedKeys = new Set(snapshot.expandedGroupKeys)
  if (expanded) {
    expandedKeys.add(key)
  } else {
    expandedKeys.delete(key)
  }

  return {
    ...snapshot,
    expandedGroupKeys: Array.from(expandedKeys),
  }
}

export function applySceneGroupExpansion(
  snapshot: GroupExpansionSnapshot,
  navigation: NavigationConfig,
  sceneId: string,
  expanded: boolean
): GroupExpansionSnapshot {
  const scene = navigation.scenes.find((item) => item.id === sceneId)
  if (!scene) {
    return snapshot
  }

  return scene.groups.reduce(
    (current, group) => applyGroupExpansion(current, scene.id, group.id, expanded),
    snapshot
  )
}

export function isGroupCollapsedForView(
  activeSceneId: string | null,
  groupId: string,
  expandedGroupKeys: ReadonlySet<string>,
  isSearchActive: boolean
) {
  return Boolean(
    !isSearchActive &&
    activeSceneId &&
    groupId &&
    !expandedGroupKeys.has(getGroupKey(activeSceneId, groupId))
  )
}
