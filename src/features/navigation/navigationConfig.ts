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

export function buildUniqueNavigationId(source: string, occupied: Iterable<string>, fallback: string) {
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

export function createSceneGroup(
  scene: NavigationSceneConfig,
  name: string
): SceneGroupConfig {
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
  previousBookmarkId?: string
) {
  const next = cloneNavigationConfig(config)
  const currentId = previousBookmarkId ?? bookmark.slug
  const existingIndex = next.bookmarks.findIndex((item) => item.slug === currentId)

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
    group.bookmarkIds.push(bookmark.slug)
  })

  return parseNavigationConfig(next)
}

export function removeBookmarkFromScene(
  config: NavigationConfig,
  sceneId: string,
  bookmarkId: string
) {
  const next = cloneNavigationConfig(config)
  const scene = findScene(next, sceneId)
  if (!scene) {
    return next
  }
  scene.groups.forEach((group) => {
    group.bookmarkIds = group.bookmarkIds.filter((id) => id !== bookmarkId)
  })
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
