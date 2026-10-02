import { createContext, useContext } from 'react'
import type { BookmarkSnapshot } from '@shared/bookmarkSnapshot'
import type { NavigationConfig, ServicesConfig } from '@/config/schema'

export const NavigationViewContext = createContext<{
  authenticated: boolean
  online?: boolean
  snapshot: BookmarkSnapshot | null
}>({ authenticated: true, snapshot: null })
export const useNavigationView = () => useContext(NavigationViewContext)

/** Display projection only. No revision: it can never be submitted as authoritative config. */
export function snapshotNavigation(
  snapshot: BookmarkSnapshot | null
): NavigationConfig | undefined {
  if (!snapshot?.scenes.length) return undefined
  const bookmarks = new Map<string, NavigationConfig['bookmarks'][number]>()
  const scenes = snapshot.scenes.map((scene) => ({
    id: scene.id,
    name: scene.name,
    protected: false,
    groups: scene.groups
      .filter((group) => group.id !== '__quick_records')
      .map((group) => ({
        id: group.id,
        name: group.name,
        bookmarkIds: group.items.map(({ id, ...item }) => {
          bookmarks.set(id, { slug: id, ...item })
          return id
        }),
      })),
    quickRecords: (scene.groups.find((group) => group.id === '__quick_records')?.items ?? []).map(
      (item) => ({
        ...item,
        createdAt: item.createdAt ?? snapshot.updatedAt,
        updatedAt: item.updatedAt ?? snapshot.updatedAt,
      })
    ),
  }))
  return {
    defaultSceneId: scenes.some((s) => s.id === snapshot.defaultSceneId)
      ? snapshot.defaultSceneId!
      : scenes[0].id,
    bookmarks: [...bookmarks.values()],
    scenes,
  }
}
export function sceneServices(
  config: NavigationConfig | undefined,
  sceneId: string | null
): ServicesConfig | undefined {
  const scene = config?.scenes.find((scene) => scene.id === sceneId)
  if (!scene || scene.protected) return undefined
  const bookmarks = new Map(config!.bookmarks.map((bookmark) => [bookmark.slug, bookmark]))
  return scene.groups.map((group) => ({
    category: group.name,
    items: group.bookmarkIds.flatMap((id) => (bookmarks.has(id) ? [bookmarks.get(id)!] : [])),
  }))
}
