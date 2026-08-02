import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { NavigationConfig, ServiceConfig } from '../src/config/schema.js'

export const integrationTokenHeader = 'x-harbordeck-search-token'
const legacyIntegrationTokenHeader = 'x-smart-harbor-search-token'

export const integrationBookmarkBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  primaryUrl: z.string().trim().url(),
  secondaryUrl: z.string().trim().url().optional(),
  note: z.string().max(5000).optional(),
  placements: z
    .array(
      z.object({
        sceneId: z.string().trim().min(1),
        groupId: z.string().trim().min(1),
      })
    )
    .min(1)
    .max(100),
})

export const integrationBookmarkLookupQuerySchema = z.object({
  url: z.string().trim().url().max(2000),
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
}

export interface IntegrationBookmarkInfo {
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

function comparableUrl(value: string) {
  try {
    const parsed = new URL(value.trim())
    parsed.hash = ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return value.trim().replace(/\/$/, '')
  }
}

function urlsMatch(left: string | undefined, right: string | undefined) {
  return Boolean(left && right && comparableUrl(left) === comparableUrl(right))
}

function bookmarkMatchesAnyUrl(bookmark: ServiceConfig, urls: string[]) {
  return urls.some((url) => urlsMatch(bookmark.primaryUrl, url) || urlsMatch(bookmark.secondaryUrl, url))
}

function toIntegrationBookmarkInfo(bookmark: ServiceConfig): IntegrationBookmarkInfo {
  return {
    name: bookmark.name,
    primaryUrl: bookmark.primaryUrl,
    ...(bookmark.secondaryUrl ? { secondaryUrl: bookmark.secondaryUrl } : {}),
    ...(bookmark.note ? { note: bookmark.note } : {}),
  }
}

export function lookupIntegrationBookmark(navigation: NavigationConfig, url: string) {
  const bookmark = navigation.bookmarks.find((item) => bookmarkMatchesAnyUrl(item, [url]))
  if (!bookmark) {
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
    })),
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

  const submittedUrls = [body.primaryUrl, body.secondaryUrl].filter(
    (value): value is string => Boolean(value)
  )
  let bookmark = next.bookmarks.find((item) => bookmarkMatchesAnyUrl(item, submittedUrls))
  let created = false
  if (!bookmark) {
    bookmark = {
      slug: buildUniqueSlug(body.name, next.bookmarks.map((item) => item.slug)),
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
    const submittedSecondaryUrl = body.secondaryUrl?.trim()
    if (
      !mergedBookmark.secondaryUrl &&
      submittedSecondaryUrl &&
      !urlsMatch(mergedBookmark.primaryUrl, submittedSecondaryUrl)
    ) {
      mergedBookmark.secondaryUrl = submittedSecondaryUrl
    }
    if (!mergedBookmark.secondaryUrl && !urlsMatch(mergedBookmark.primaryUrl, body.primaryUrl)) {
      mergedBookmark.secondaryUrl = body.primaryUrl
    }
    if (!mergedBookmark.note && body.note?.trim()) {
      mergedBookmark.note = body.note.trim()
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
