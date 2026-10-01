import { z } from 'zod'
import type { NavigationConfig } from '../src/config/schema'

export const BOOKMARK_CACHE_KEY = 'harborDeckBookmarkSnapshotV1'
export const CACHE_MESSAGE = 'harbordeck:bookmark-cache'
export const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024
const http = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value))
const item = z.object({
  id: z.string(),
  name: z.string(),
  primaryUrl: http,
  secondaryUrl: http.optional(),
  note: z.string().optional(),
})
const group = z.object({ id: z.string(), name: z.string(), items: z.array(item) })
export const bookmarkSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  source: http,
  username: z.string().min(1),
  updatedAt: z.number().finite().nonnegative(),
  revision: z.string().optional(),
  scenes: z.array(z.object({ id: z.string(), name: z.string(), groups: z.array(group) })),
})
export type BookmarkSnapshot = z.infer<typeof bookmarkSnapshotSchema>

export function cacheSource(value: string): string {
  try {
    const url = new URL(value)
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return ''
    url.search = ''
    url.hash = ''
    if (url.pathname === '/index.html') url.pathname = '/'
    return url.toString()
  } catch {
    return ''
  }
}

export function parseBookmarkSnapshot(value: unknown, source?: string): BookmarkSnapshot | null {
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    if (!serialized || new TextEncoder().encode(serialized).length > MAX_SNAPSHOT_BYTES) return null
    const result = bookmarkSnapshotSchema.safeParse(JSON.parse(serialized))
    if (!result.success || result.data.source !== cacheSource(result.data.source)) return null
    if (source && result.data.source !== cacheSource(source)) return null
    return result.data
  } catch {
    return null
  }
}

/** Whitelist display fields; never persist the full config or unlocked protected scenes. */
export function makeBookmarkSnapshot(
  config: NavigationConfig,
  source: string,
  username: string
): BookmarkSnapshot {
  const bookmarks = new Map(config.bookmarks.map((bookmark) => [bookmark.slug, bookmark]))
  const display = (
    value: { name: string; primaryUrl: string; secondaryUrl?: string; note?: string },
    id: string
  ) => ({
    id,
    name: value.name,
    primaryUrl: value.primaryUrl,
    ...(value.secondaryUrl ? { secondaryUrl: value.secondaryUrl } : {}),
    ...(value.note ? { note: value.note } : {}),
  })
  return bookmarkSnapshotSchema.parse({
    schemaVersion: 1,
    source: cacheSource(source),
    username,
    updatedAt: Date.now(),
    revision: config._revision,
    scenes: config.scenes
      .filter((scene) => !scene.protected)
      .map((scene) => ({
        id: scene.id,
        name: scene.name,
        groups: [
          ...scene.groups.map((entry) => ({
            id: entry.id,
            name: entry.name,
            items: entry.bookmarkIds.flatMap((id) => {
              const bookmark = bookmarks.get(id)
              return bookmark ? [display(bookmark, id)] : []
            }),
          })),
          ...(scene.quickRecords.length
            ? [
                {
                  id: '__quick_records',
                  name: '快速记录 / Quick records',
                  items: scene.quickRecords.map((record) => display(record, record.id)),
                },
              ]
            : []),
        ],
      })),
  })
}
