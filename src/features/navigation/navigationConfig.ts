import {
  navigationConfigSchema,
  type NavigationConfig,
  type NavigationSceneConfig,
  type SceneGroupConfig,
  type ServiceConfig,
  type ServicesConfig,
} from '@/config/schema'

export interface BookmarkPlacement {
  sceneId: string
  groupId: string
}

export interface BookmarkPlacementConflict {
  bookmarkId: string
  sceneId: string
  groupId: string
  groupName: string
}

export interface UpsertBookmarkOptions {
  preserveExistingPlacement?: boolean
  insertAfterBookmarkId?: string
}

export function cloneNavigationConfig(config: NavigationConfig): NavigationConfig {
  return {
    defaultSceneId: config.defaultSceneId,
    bookmarks: config.bookmarks.map((bookmark) => ({
      ...bookmark,
      probes: bookmark.probes ? [...bookmark.probes] : undefined,
    })),
    scenes: config.scenes.map((scene) => ({
      ...scene,
      groups: scene.groups.map((group) => ({
        ...group,
        bookmarkIds: [...group.bookmarkIds],
      })),
    })),
  }
}

export function parseNavigationConfig(input: unknown): NavigationConfig {
  return navigationConfigSchema.parse(input)
}

export function findScene(config: NavigationConfig, sceneId: string) {
  return config.scenes.find((scene) => scene.id === sceneId)
}

export function resolveSceneServices(config: NavigationConfig, sceneId: string): ServicesConfig {
  const scene = findScene(config, sceneId)
  if (!scene) {
    return []
  }

  const bookmarksById = new Map(config.bookmarks.map((bookmark) => [bookmark.slug, bookmark]))

  return scene.groups.map((group) => ({
    category: group.name,
    items: group.bookmarkIds
      .map((bookmarkId) => bookmarksById.get(bookmarkId))
      .filter((bookmark): bookmark is ServiceConfig => Boolean(bookmark))
      .map((bookmark) => ({
        ...bookmark,
        probes: bookmark.probes ? [...bookmark.probes] : undefined,
      })),
  }))
}

export function getBookmarkPlacements(
  config: NavigationConfig,
  bookmarkId: string
): BookmarkPlacement[] {
  return config.scenes.flatMap((scene) =>
    scene.groups
      .filter((group) => group.bookmarkIds.includes(bookmarkId))
      .map((group) => ({ sceneId: scene.id, groupId: group.id }))
  )
}

export function buildUniqueNavigationId(
  source: string,
  occupied: Iterable<string>,
  fallback: string
) {
  const normalized = source
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const base = normalized || fallback
  const used = new Set(occupied)

  if (!used.has(base)) {
    return base
  }

  let suffix = 2
  while (used.has(`${base}-${suffix}`)) {
    suffix += 1
  }
  return `${base}-${suffix}`
}

export function createScene(config: NavigationConfig, name: string): NavigationSceneConfig {
  const id = buildUniqueNavigationId(
    name,
    config.scenes.map((scene) => scene.id),
    'scene'
  )

  return {
    id,
    name: name.trim(),
    protected: false,
    groups: [],
  }
}

export function createSceneGroup(scene: NavigationSceneConfig, name: string): SceneGroupConfig {
  return {
    id: buildUniqueNavigationId(
      name,
      scene.groups.map((group) => group.id),
      'group'
    ),
    name: name.trim(),
    bookmarkIds: [],
  }
}

export function upsertBookmark(
  config: NavigationConfig,
  bookmark: ServiceConfig,
  placements: BookmarkPlacement[],
  previousBookmarkId?: string,
  options: UpsertBookmarkOptions = {}
) {
  const next = cloneNavigationConfig(config)
  const currentId = previousBookmarkId ?? bookmark.slug
  const existingIndex = next.bookmarks.findIndex((item) => item.slug === currentId)
  const originalPlacementIndexes = new Map<string, number>()

  if (options.preserveExistingPlacement && previousBookmarkId) {
    config.scenes.forEach((scene) => {
      scene.groups.forEach((group) => {
        const index = group.bookmarkIds.indexOf(previousBookmarkId)
        if (index >= 0) {
          originalPlacementIndexes.set(`${scene.id}:${group.id}`, index)
        }
      })
    })
  }

  if (existingIndex >= 0) {
    next.bookmarks[existingIndex] = bookmark
  } else {
    next.bookmarks.push(bookmark)
  }

  next.scenes.forEach((scene) => {
    scene.groups.forEach((group) => {
      group.bookmarkIds = group.bookmarkIds.filter((id) => id !== currentId && id !== bookmark.slug)
    })
  })

  placements.forEach((placement) => {
    const scene = findScene(next, placement.sceneId)
    const group = scene?.groups.find((item) => item.id === placement.groupId)
    if (!group) {
      throw new Error('所选场景分组不存在')
    }
    let insertIndex = group.bookmarkIds.length
    if (options.insertAfterBookmarkId) {
      const sourceIndex = group.bookmarkIds.indexOf(options.insertAfterBookmarkId)
      if (sourceIndex >= 0) {
        insertIndex = sourceIndex + 1
      }
    } else if (options.preserveExistingPlacement && previousBookmarkId) {
      const originalIndex = originalPlacementIndexes.get(`${placement.sceneId}:${placement.groupId}`)
      if (typeof originalIndex === 'number') {
        insertIndex = Math.min(originalIndex, group.bookmarkIds.length)
      }
    }
    group.bookmarkIds.splice(insertIndex, 0, bookmark.slug)
  })

  return parseNavigationConfig(next)
}

export function getBookmarkPlacementConflicts(
  config: NavigationConfig,
  bookmarkIds: string[],
  placements: BookmarkPlacement[]
) {
  const conflicts: BookmarkPlacementConflict[] = []
  const requestedIds = new Set(bookmarkIds)

  placements.forEach((placement) => {
    const scene = findScene(config, placement.sceneId)
    const targetGroup = scene?.groups.find((group) => group.id === placement.groupId)
    if (!scene || !targetGroup) {
      return
    }

    scene.groups.forEach((group) => {
      if (group.id === targetGroup.id) {
        return
      }
      group.bookmarkIds.forEach((bookmarkId) => {
        if (requestedIds.has(bookmarkId)) {
          conflicts.push({
            bookmarkId,
            sceneId: scene.id,
            groupId: group.id,
            groupName: group.name,
          })
        }
      })
    })
  })

  return conflicts
}

export function addBookmarksToSceneGroups(
  config: NavigationConfig,
  bookmarkIds: string[],
  placements: BookmarkPlacement[],
  moveConflicts = false
) {
  const next = cloneNavigationConfig(config)
  const requestedIds = new Set(bookmarkIds)
  const placementsByScene = new Map<string, BookmarkPlacement>()

  placements.forEach((placement) => {
    placementsByScene.set(placement.sceneId, placement)
  })

  placementsByScene.forEach((placement) => {
    const scene = findScene(next, placement.sceneId)
    const targetGroup = scene?.groups.find((group) => group.id === placement.groupId)
    if (!scene || !targetGroup) {
      throw new Error('鎵€閫夊満鏅垎缁勪笉瀛樺湪')
    }

    requestedIds.forEach((bookmarkId) => {
      const currentGroup = scene.groups.find((group) => group.bookmarkIds.includes(bookmarkId))
      if (currentGroup?.id === targetGroup.id) {
        return
      }
      if (currentGroup && !moveConflicts) {
        return
      }
      if (currentGroup) {
        currentGroup.bookmarkIds = currentGroup.bookmarkIds.filter((id) => id !== bookmarkId)
      }
      if (!targetGroup.bookmarkIds.includes(bookmarkId)) {
        targetGroup.bookmarkIds.push(bookmarkId)
      }
    })
  })

  return parseNavigationConfig(next)
}

export function moveSceneGroup(
  config: NavigationConfig,
  sceneId: string,
  groupId: string,
  targetIndex: number
) {
  const next = cloneNavigationConfig(config)
  const scene = findScene(next, sceneId)
  if (!scene) {
    return next
  }
  const sourceIndex = scene.groups.findIndex((group) => group.id === groupId)
  if (sourceIndex < 0) {
    return next
  }
  const [group] = scene.groups.splice(sourceIndex, 1)
  scene.groups.splice(Math.max(0, Math.min(targetIndex, scene.groups.length)), 0, group)
  return parseNavigationConfig(next)
}

export function removeBookmarkFromScene(
  config: NavigationConfig,
  sceneId: string,
  bookmarkId: string
) {
  return removeBookmarksFromScene(config, sceneId, [bookmarkId])
}

export function removeBookmarksFromScene(
  config: NavigationConfig,
  sceneId: string,
  bookmarkIds: string[]
) {
  const next = cloneNavigationConfig(config)
  const scene = findScene(next, sceneId)
  if (!scene) {
    return next
  }

  const removedBookmarkIds = new Set(bookmarkIds)
  scene.groups.forEach((group) => {
    group.bookmarkIds = group.bookmarkIds.filter((id) => !removedBookmarkIds.has(id))
  })

  const referencedBookmarkIds = new Set(
    next.scenes.flatMap((item) => item.groups.flatMap((group) => group.bookmarkIds))
  )
  next.bookmarks = next.bookmarks.filter(
    (bookmark) => !removedBookmarkIds.has(bookmark.slug) || referencedBookmarkIds.has(bookmark.slug)
  )

  return parseNavigationConfig(next)
}

export function removeGroupFromScene(config: NavigationConfig, sceneId: string, groupId: string) {
  const next = cloneNavigationConfig(config)
  const scene = findScene(next, sceneId)
  if (!scene) {
    return next
  }

  const groupIndex = scene.groups.findIndex((group) => group.id === groupId)
  if (groupIndex < 0) {
    return next
  }

  const [removedGroup] = scene.groups.splice(groupIndex, 1)
  const removedBookmarkIds = new Set(removedGroup.bookmarkIds)
  const referencedBookmarkIds = new Set(
    next.scenes.flatMap((item) => item.groups.flatMap((group) => group.bookmarkIds))
  )

  next.bookmarks = next.bookmarks.filter(
    (bookmark) => !removedBookmarkIds.has(bookmark.slug) || referencedBookmarkIds.has(bookmark.slug)
  )

  return parseNavigationConfig(next)
}

export function moveBookmarksInScene(
  config: NavigationConfig,
  sceneId: string,
  bookmarkIds: string[],
  targetGroupId: string,
  targetBookmarkIndex?: number
) {
  const next = cloneNavigationConfig(config)
  const scene = findScene(next, sceneId)
  const targetGroup = scene?.groups.find((group) => group.id === targetGroupId)
  if (!scene || !targetGroup) {
    return next
  }

  const requestedIds = new Set(bookmarkIds)
  const seenIds = new Set<string>()
  const orderedBookmarkIds = scene.groups.flatMap((group) =>
    group.bookmarkIds.filter((bookmarkId) => {
      if (!requestedIds.has(bookmarkId) || seenIds.has(bookmarkId)) {
        return false
      }
      seenIds.add(bookmarkId)
      return true
    })
  )
  if (orderedBookmarkIds.length === 0) {
    return next
  }

  const movingIds = new Set(orderedBookmarkIds)
  const originalTargetIds = [...targetGroup.bookmarkIds]
  const removedBeforeTarget =
    typeof targetBookmarkIndex === 'number'
      ? originalTargetIds
          .slice(0, Math.max(targetBookmarkIndex, 0))
          .filter((bookmarkId) => movingIds.has(bookmarkId)).length
      : 0

  scene.groups.forEach((group) => {
    group.bookmarkIds = group.bookmarkIds.filter((bookmarkId) => !movingIds.has(bookmarkId))
  })

  const insertIndex =
    typeof targetBookmarkIndex === 'number'
      ? Math.min(
          Math.max(targetBookmarkIndex - removedBeforeTarget, 0),
          targetGroup.bookmarkIds.length
        )
      : targetGroup.bookmarkIds.length
  targetGroup.bookmarkIds.splice(insertIndex, 0, ...orderedBookmarkIds)

  return parseNavigationConfig(next)
}

export function renameGroupInScene(
  config: NavigationConfig,
  sceneId: string,
  groupId: string,
  name: string
) {
  const next = cloneNavigationConfig(config)
  const group = findScene(next, sceneId)?.groups.find((item) => item.id === groupId)
  if (!group) {
    return next
  }

  group.name = name.trim()
  return parseNavigationConfig(next)
}

export function deleteBookmark(config: NavigationConfig, bookmarkId: string) {
  const next = cloneNavigationConfig(config)
  next.bookmarks = next.bookmarks.filter((bookmark) => bookmark.slug !== bookmarkId)
  next.scenes.forEach((scene) => {
    scene.groups.forEach((group) => {
      group.bookmarkIds = group.bookmarkIds.filter((id) => id !== bookmarkId)
    })
  })
  return parseNavigationConfig(next)
}
