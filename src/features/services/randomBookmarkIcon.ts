import type { NavigationConfig } from '@/config/schema'

const randomBookmarkIcons = [
  'bookmark',
  'star',
  'sparkles',
  'layers-2',
  'link-2',
  'rocket',
  'workflow',
  'app-window',
  'globe',
  'layout-dashboard',
  'book-open',
  'code',
  'calendar-days',
  'search',
  'terminal',
  'database',
  'server',
  'folder',
  'house',
  'settings',
  'wrench',
  'heart',
  'circle-dot',
] as const

export function getRandomBookmarkIcon() {
  return randomBookmarkIcons[Math.floor(Math.random() * randomBookmarkIcons.length)]
}

function getMissingIconTargetIds(config: NavigationConfig, editableSceneIds?: ReadonlySet<string>) {
  const editableIds = editableSceneIds ?? new Set(config.scenes.map((scene) => scene.id))
  const blockedBookmarkIds = new Set(
    config.scenes
      .filter((scene) => !editableIds.has(scene.id))
      .flatMap((scene) => scene.groups.flatMap((group) => group.bookmarkIds))
  )
  const editableBookmarkIds = new Set(
    config.scenes
      .filter((scene) => editableIds.has(scene.id))
      .flatMap((scene) => scene.groups.flatMap((group) => group.bookmarkIds))
  )
  const canEditEveryScene = config.scenes.every((scene) => editableIds.has(scene.id))

  return new Set(
    config.bookmarks
      .filter(
        (bookmark) =>
          !bookmark.icon &&
          !blockedBookmarkIds.has(bookmark.slug) &&
          (canEditEveryScene || editableBookmarkIds.has(bookmark.slug))
      )
      .map((bookmark) => bookmark.slug)
  )
}

export function getMissingBookmarkIconCount(
  config: NavigationConfig,
  editableSceneIds?: ReadonlySet<string>
) {
  const editableIds = editableSceneIds ?? new Set(config.scenes.map((scene) => scene.id))
  const bookmarkIds = getMissingIconTargetIds(config, editableIds)
  const quickRecordCount = config.scenes
    .filter((scene) => editableIds.has(scene.id))
    .reduce(
      (count, scene) => count + (scene.quickRecords ?? []).filter((record) => !record.icon).length,
      0
    )

  return bookmarkIds.size + quickRecordCount
}

export function fillMissingBookmarkIcons(
  config: NavigationConfig,
  options?: {
    editableSceneIds?: ReadonlySet<string>
    getIcon?: () => string
  }
) {
  const editableIds = options?.editableSceneIds ?? new Set(config.scenes.map((scene) => scene.id))
  const targetBookmarkIds = getMissingIconTargetIds(config, editableIds)
  const getIcon = options?.getIcon ?? getRandomBookmarkIcon
  let updatedCount = 0

  const bookmarks = config.bookmarks.map((bookmark) => {
    if (!targetBookmarkIds.has(bookmark.slug)) {
      return bookmark
    }
    updatedCount += 1
    return { ...bookmark, icon: getIcon() }
  })
  const scenes = config.scenes.map((scene) => {
    if (!editableIds.has(scene.id)) {
      return scene
    }
    let sceneChanged = false
    const quickRecords = (scene.quickRecords ?? []).map((record) => {
      if (record.icon) {
        return record
      }
      sceneChanged = true
      updatedCount += 1
      return { ...record, icon: getIcon() }
    })

    return sceneChanged ? { ...scene, quickRecords } : scene
  })

  return {
    config: updatedCount > 0 ? { ...config, bookmarks, scenes } : config,
    updatedCount,
  }
}
