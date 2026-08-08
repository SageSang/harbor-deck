import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import {
  httpUrlSchema,
  isHttpUrl,
  type NavigationConfig,
  type QuickRecord,
  type ServiceConfig,
} from '../src/config/schema.js'
import { bookmarkMatchesAnyUrl } from '../src/features/services/bookmarkUrl.js'
import { quickRecordMatchesSearch } from '../src/features/services/quickRecordSearch.js'

export const integrationTokenHeader = 'x-harbordeck-search-token'
const legacyIntegrationTokenHeader = 'x-smart-harbor-search-token'

export const integrationBookmarkBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  primaryUrl: httpUrlSchema,
  secondaryUrl: httpUrlSchema.optional(),
  note: z.string().max(5000).optional(),
  existingBookmarkSlug: z.string().trim().min(1).max(200).optional(),
  placements: z
    .array(
      z.object({
        sceneId: z.string().trim().min(1),
        groupId: z.string().trim().min(1),
      })
    )
    .max(100)
    .default([]),
  recordSceneId: z.string().trim().min(1).optional(),
})

export const integrationBookmarkLookupQuerySchema = z.object({
  url: z.string().trim().max(2000).refine(isHttpUrl, 'Only HTTP and HTTPS URLs are supported'),
})

export type IntegrationBookmarkBody = z.infer<typeof integrationBookmarkBodySchema>

export interface IntegrationSearchResult {
  sceneId: string
  sceneName: string
  groupId: string
  groupName: string
  slug: string
  name: string
  url: string
  recordId?: string
}

export interface IntegrationBookmarkInfo {
  slug: string
  name: string
  primaryUrl: string
  secondaryUrl?: string
  note?: string
}

export interface IntegrationBookmarkPlacement {
  sceneId: string
  groupId: string
}

const iconPool = [
  'Globe2',
  'Compass',
  'Bookmark',
  'Star',
  'Sparkles',
  'Layers3',
  'Link2',
  'Rocket',
  'Workflow',
  'AppWindow',
]

function configuredToken() {
  return (
    process.env.HARBORDECK_SEARCH_TOKEN?.trim() ||
    process.env.SMART_HARBOR_SEARCH_TOKEN?.trim() ||
    process.env.SEARCH_API_TOKEN?.trim() ||
    ''
  )
}

export function isIntegrationTokenValid(suppliedToken: unknown) {
  const expected = configuredToken()
  if (!expected || typeof suppliedToken !== 'string' || suppliedToken.length === 0) {
    return false
  }

  const expectedDigest = createHash('sha256').update(expected).digest()
  const suppliedDigest = createHash('sha256').update(suppliedToken).digest()
  return timingSafeEqual(expectedDigest, suppliedDigest)
}

export function getIntegrationTokenStatus() {
  return Boolean(configuredToken())
}

export function readIntegrationTokenHeader(headers: Record<string, unknown>) {
  const value = headers[integrationTokenHeader] ?? headers[legacyIntegrationTokenHeader]
  return Array.isArray(value) ? value[0] : value
}

function matchesBookmark(bookmark: ServiceConfig, query: string) {
  const haystack = [
    bookmark.name,
    bookmark.slug,
    bookmark.primaryUrl,
    bookmark.secondaryUrl ?? '',
    bookmark.note ?? '',
  ]
    .join('\n')
    .toLocaleLowerCase()
  return haystack.includes(query.toLocaleLowerCase())
}

function toIntegrationBookmarkInfo(bookmark: ServiceConfig): IntegrationBookmarkInfo {
  return {
    slug: bookmark.slug,
    name: bookmark.name,
    primaryUrl: bookmark.primaryUrl,
    ...(bookmark.secondaryUrl ? { secondaryUrl: bookmark.secondaryUrl } : {}),
    ...(bookmark.note ? { note: bookmark.note } : {}),
  }
}

function isBookmarkVisibleInUnlockedScene(navigation: NavigationConfig, slug: string) {
  return navigation.scenes.some(
    (scene) => !scene.protected && scene.groups.some((group) => group.bookmarkIds.includes(slug))
  )
}

export function lookupIntegrationBookmark(navigation: NavigationConfig, url: string) {
  const bookmark = navigation.bookmarks.find((item) => bookmarkMatchesAnyUrl(item, [url]))
  if (!bookmark) {
    for (const scene of navigation.scenes) {
      if (scene.protected) continue
      const record = (scene.quickRecords ?? []).find((item) => bookmarkMatchesAnyUrl(item, [url]))
      if (record) {
        return {
          bookmark: null,
          quickRecord: {
            id: record.id,
            sceneId: scene.id,
            name: record.name,
            primaryUrl: record.primaryUrl,
            ...(record.secondaryUrl ? { secondaryUrl: record.secondaryUrl } : {}),
            ...(record.note ? { note: record.note } : {}),
          },
          placements: [] as IntegrationBookmarkPlacement[],
        }
      }
    }
    return { bookmark: null, placements: [] as IntegrationBookmarkPlacement[] }
  }

  const placements: IntegrationBookmarkPlacement[] = []
  navigation.scenes.forEach((scene) => {
    if (scene.protected) return
    scene.groups.forEach((group) => {
      if (group.bookmarkIds.includes(bookmark.slug)) {
        placements.push({ sceneId: scene.id, groupId: group.id })
      }
    })
  })

  // Never reveal a bookmark that is only referenced by protected scenes. The
  // POST path still merges into that existing record without exposing it.
  if (placements.length === 0) {
    return { bookmark: null, placements }
  }

  return { bookmark: toIntegrationBookmarkInfo(bookmark), placements }
}

export function searchNavigationBookmarks(
  navigation: NavigationConfig,
  query: string,
  sceneId?: string
): IntegrationSearchResult[] {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return []

  const bookmarkById = new Map(navigation.bookmarks.map((bookmark) => [bookmark.slug, bookmark]))
  const scenes = navigation.scenes.filter(
    (scene) => !scene.protected && (!sceneId || sceneId === 'all' || scene.id === sceneId)
  )
  const results: IntegrationSearchResult[] = []

  scenes.forEach((scene) => {
    scene.groups.forEach((group) => {
      group.bookmarkIds.forEach((bookmarkId) => {
        const bookmark = bookmarkById.get(bookmarkId)
        if (!bookmark || !matchesBookmark(bookmark, normalizedQuery)) return
        results.push({
          sceneId: scene.id,
          sceneName: scene.name,
          groupId: group.id,
          groupName: group.name,
          slug: bookmark.slug,
          name: bookmark.name,
          url: bookmark.secondaryUrl || bookmark.primaryUrl,
        })
      })
    })
    ;(scene.quickRecords ?? []).forEach((record) => {
      if (!quickRecordMatchesSearch(record, normalizedQuery)) {
        return
      }
      results.push({
        sceneId: scene.id,
        sceneName: scene.name,
        groupId: '',
        groupName: '',
        slug: `quick-${record.id}`,
        recordId: record.id,
        name: record.name,
        url: record.secondaryUrl || record.primaryUrl,
      })
    })
  })

  return results
}

function buildUniqueSlug(source: string, occupied: Iterable<string>) {
  const normalized = source
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const base = normalized || 'bookmark'
  const used = new Set(occupied)
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export function createIntegrationBookmark(
  navigation: NavigationConfig,
  body: IntegrationBookmarkBody
) {
  const next: NavigationConfig = {
    defaultSceneId: navigation.defaultSceneId,
    bookmarks: navigation.bookmarks.map((bookmark) => ({
      ...bookmark,
      probes: bookmark.probes ? [...bookmark.probes] : undefined,
    })),
    scenes: navigation.scenes.map((scene) => ({
      ...scene,
      groups: scene.groups.map((group) => ({ ...group, bookmarkIds: [...group.bookmarkIds] })),
      quickRecords: (scene.quickRecords ?? []).map((record) => ({ ...record })),
    })),
  }

  const submittedUrls = [body.primaryUrl, body.secondaryUrl].filter((value): value is string =>
    Boolean(value)
  )

  // Empty placements deliberately mean “quick record”.  It stays searchable
  // in the selected scene without adding a normal group reference.
  if (body.placements.length === 0) {
    const targetScene =
      next.scenes.find((scene) => scene.id === body.recordSceneId) ??
      next.scenes.find((scene) => scene.id === next.defaultSceneId && !scene.protected) ??
      next.scenes.find((scene) => !scene.protected)
    if (!targetScene || targetScene.protected) {
      throw new Error('No unlocked record scene is available')
    }

    const existing = (targetScene.quickRecords ?? []).find((record) =>
      bookmarkMatchesAnyUrl(record, submittedUrls)
    )
    const now = Date.now()
    const record: QuickRecord = {
      id: existing?.id ?? `quick-${now.toString(36)}-${randomInt(1000, 9999)}`,
      name: body.name,
      primaryUrl: body.primaryUrl,
      ...(body.secondaryUrl ? { secondaryUrl: body.secondaryUrl } : {}),
      ...(body.note?.trim() ? { note: body.note.trim() } : {}),
      icon: existing?.icon ?? iconPool[randomInt(iconPool.length)],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    if (existing) {
      const quickRecords = targetScene.quickRecords ?? (targetScene.quickRecords = [])
      const index = quickRecords.findIndex((item) => item.id === existing.id)
      quickRecords[index] = record
    } else {
      ;(targetScene.quickRecords ?? (targetScene.quickRecords = [])).push(record)
    }
    return {
      navigation: next,
      bookmark: null,
      quickRecord: record,
      placements: [],
      recordSceneId: targetScene.id,
      created: !existing,
    }
  }
  const targets = new Map<string, { sceneId: string; groupId: string }>()

  body.placements.forEach((placement) => {
    const scene = next.scenes.find((item) => item.id === placement.sceneId)
    const group = scene?.groups.find((item) => item.id === placement.groupId)
    if (!scene || !group || scene.protected) return
    targets.set(scene.id, { sceneId: scene.id, groupId: group.id })
  })

  if (targets.size === 0) {
    throw new Error('No unlocked target scenes are available')
  }

  const requestedBookmark = body.existingBookmarkSlug
    ? next.bookmarks.find(
        (item) =>
          item.slug === body.existingBookmarkSlug &&
          isBookmarkVisibleInUnlockedScene(next, item.slug)
      )
    : undefined
  let bookmark =
    requestedBookmark ?? next.bookmarks.find((item) => bookmarkMatchesAnyUrl(item, submittedUrls))
  const replaceExistingMetadata = Boolean(requestedBookmark)
  let created = false
  const existingQuickRecord = !bookmark
    ? Array.from(targets.values())
        .map(({ sceneId }) => next.scenes.find((scene) => scene.id === sceneId))
        .flatMap((scene) => scene?.quickRecords ?? [])
        .find((record) => bookmarkMatchesAnyUrl(record, submittedUrls))
    : undefined
  if (!bookmark) {
    bookmark = existingQuickRecord
      ? {
          slug: buildUniqueSlug(
            body.name,
            next.bookmarks.map((item) => item.slug)
          ),
          name: body.name,
          icon: existingQuickRecord.icon,
          primaryUrl: body.primaryUrl,
          ...(body.secondaryUrl ? { secondaryUrl: body.secondaryUrl } : {}),
          ...(body.note?.trim() ? { note: body.note.trim() } : {}),
        }
      : {
          slug: buildUniqueSlug(
            body.name,
            next.bookmarks.map((item) => item.slug)
          ),
          name: body.name,
          icon: iconPool[randomInt(iconPool.length)],
          primaryUrl: body.primaryUrl,
          ...(body.secondaryUrl ? { secondaryUrl: body.secondaryUrl } : {}),
          ...(body.note?.trim() ? { note: body.note.trim() } : {}),
        }
    next.bookmarks.push(bookmark)
    created = true
  } else {
    const mergedBookmark = { ...bookmark }
    if (replaceExistingMetadata) {
      mergedBookmark.name = body.name
      mergedBookmark.primaryUrl = body.primaryUrl
      if (body.secondaryUrl) {
        mergedBookmark.secondaryUrl = body.secondaryUrl
      } else {
        delete mergedBookmark.secondaryUrl
      }
      if (body.note?.trim()) {
        mergedBookmark.note = body.note.trim()
      } else {
        delete mergedBookmark.note
      }
    } else {
      const submittedSecondaryUrl = body.secondaryUrl?.trim()
      if (
        !mergedBookmark.secondaryUrl &&
        submittedSecondaryUrl &&
        !bookmarkMatchesAnyUrl(mergedBookmark, [submittedSecondaryUrl])
      ) {
        mergedBookmark.secondaryUrl = submittedSecondaryUrl
      }
      if (
        !mergedBookmark.secondaryUrl &&
        !bookmarkMatchesAnyUrl(mergedBookmark, [body.primaryUrl])
      ) {
        mergedBookmark.secondaryUrl = body.primaryUrl
      }
      if (!mergedBookmark.note && body.note?.trim()) {
        mergedBookmark.note = body.note.trim()
      }
    }
    if (JSON.stringify(mergedBookmark) !== JSON.stringify(bookmark)) {
      const bookmarkIndex = next.bookmarks.findIndex((item) => item.slug === bookmark!.slug)
      next.bookmarks[bookmarkIndex] = mergedBookmark
      bookmark = mergedBookmark
    }
  }

  targets.forEach(({ sceneId, groupId }) => {
    const scene = next.scenes.find((item) => item.id === sceneId)!
    const targetGroup = scene.groups.find((group) => group.id === groupId)!
    const quickRecord = (scene.quickRecords ?? []).find((record) =>
      bookmarkMatchesAnyUrl(record, submittedUrls)
    )
    scene.quickRecords = (scene.quickRecords ?? []).filter(
      (record) => record.id !== quickRecord?.id
    )
    scene.groups.forEach((group) => {
      if (group.id !== targetGroup.id) {
        group.bookmarkIds = group.bookmarkIds.filter((id) => id !== bookmark!.slug)
      }
    })
    if (!targetGroup.bookmarkIds.includes(bookmark.slug)) {
      targetGroup.bookmarkIds.push(bookmark.slug)
    }
  })

  return { navigation: next, bookmark, placements: Array.from(targets.values()), created }
}
