import type { NavigationConfig } from '@/config/schema'
import {
  buildUniqueNavigationId,
  cloneNavigationConfig,
  getBookmarkPlacements,
  removeQuickRecordFromScene,
  upsertBookmark,
} from '@/features/navigation/navigationConfig'
import { bookmarkMatchesAnyUrl } from './bookmarkUrl'

export function promoteQuickRecords(
  config: NavigationConfig,
  sceneId: string,
  recordIds: string[],
  groupId: string
) {
  const scene = config.scenes.find((item) => item.id === sceneId)
  if (!scene?.groups.some((group) => group.id === groupId))
    throw new Error('请选择有效分组 / Choose a valid group')
  let next = cloneNavigationConfig(config)
  for (const id of new Set(recordIds)) {
    const record = scene.quickRecords.find((item) => item.id === id)
    if (!record) throw new Error('记录已变化，请重新加载 / Record changed; reload first')
    const existing = next.bookmarks.find((bookmark) =>
      bookmarkMatchesAnyUrl(bookmark, [record.primaryUrl, record.secondaryUrl ?? ''])
    )
    const bookmark = existing ?? {
      slug: buildUniqueNavigationId(
        record.name,
        next.bookmarks.map((item) => item.slug),
        'bookmark'
      ),
      name: record.name,
      primaryUrl: record.primaryUrl,
      secondaryUrl: record.secondaryUrl,
      note: record.note,
      icon: record.icon,
    }
    const placements = existing
      ? getBookmarkPlacements(next, existing.slug).filter((item) => item.sceneId !== sceneId)
      : []
    next = upsertBookmark(next, bookmark, [...placements, { sceneId, groupId }], existing?.slug, {
      preserveExistingPlacement: true,
    })
    next = removeQuickRecordFromScene(next, sceneId, id)
  }
  return next
}
