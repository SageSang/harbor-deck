const COLLAPSED_GROUPS_STORAGE_KEY = 'harbordeck-collapsed-groups'
const LEGACY_COLLAPSED_GROUPS_STORAGE_KEY = ['smart', '-harbor-collapsed-groups'].join('')

function getGroupKey(sceneId: string, groupId: string) {
  return `${sceneId}:${groupId}`
}

export function readCollapsedGroupKeys(): string[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const stored =
      window.localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_COLLAPSED_GROUPS_STORAGE_KEY)
    if (
      !window.localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY) &&
      stored !== null
    ) {
      window.localStorage.setItem(COLLAPSED_GROUPS_STORAGE_KEY, stored)
    }
    const parsed: unknown = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')
      ? parsed
      : []
  } catch {
    return []
  }
}

export function persistCollapsedGroupKeys(keys: Iterable<string>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(COLLAPSED_GROUPS_STORAGE_KEY, JSON.stringify(Array.from(keys)))
  } catch {
    // Local preference persistence is best-effort.
  }
}

export { getGroupKey }
