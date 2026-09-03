import { createHash, randomInt } from 'node:crypto'
import dynamicIconImports from 'lucide-react/dynamicIconImports.js'
import { ZodError } from 'zod'
import {
  serviceConfigSchema,
  type NavigationConfig,
  type NavigationSceneConfig,
  type QuickRecord,
  type ServiceConfig,
} from '../src/config/schema.js'
import { bookmarkMatchesAnyUrl } from '../src/features/services/bookmarkUrl.js'

export class BookmarkManagementError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}
export interface ManagedPlacement {
  sceneId: string
  groupId: string
  position?: number
}

export interface BookmarkCreateInput {
  slug?: string
  name: string
  note?: string | null
  icon?: string | null
  primaryUrl: string
  secondaryUrl?: string | null
  probes?: string[] | null
  forceNewTab?: boolean
  placements: ManagedPlacement[]
}

export interface BookmarkPatchInput {
  slug?: string
  name?: string
  note?: string | null
  icon?: string | null
  primaryUrl?: string
  secondaryUrl?: string | null
  probes?: string[] | null
  forceNewTab?: boolean | null
}

export interface QuickRecordInput {
  name: string
  note?: string | null
  icon?: string | null
  primaryUrl: string
  secondaryUrl?: string | null
}

export interface QuickRecordPatchInput {
  name?: string
  note?: string | null
  icon?: string | null
  primaryUrl?: string
  secondaryUrl?: string | null
}

const availableIconIds = Object.keys(dynamicIconImports).sort((left, right) =>
  left.localeCompare(right)
)
const availableIconIdSet = new Set(availableIconIds)
const randomIconIds = [
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
].filter((icon) => availableIconIdSet.has(icon))

function error(statusCode: number, code: string, message: string): never {
  throw new BookmarkManagementError(statusCode, code, message)
}

function cloneNavigation(navigation: NavigationConfig): NavigationConfig {
  return {
    defaultSceneId: navigation.defaultSceneId,
    bookmarks: navigation.bookmarks.map((bookmark) => ({
      ...bookmark,
      probes: bookmark.probes ? [...bookmark.probes] : undefined,
    })),
    scenes: navigation.scenes.map((scene) => ({
      ...scene,
      groups: scene.groups.map((group) => ({ ...group, bookmarkIds: [...group.bookmarkIds] })),
      quickRecords: scene.quickRecords.map((record) => ({ ...record })),
    })),
  }
}

function findScene(navigation: NavigationConfig, sceneId: string) {
  const scene = navigation.scenes.find((item) => item.id === sceneId)
  if (!scene) error(404, 'SCENE_NOT_FOUND', '指定场景不存在')
  return scene
}

function findGroup(scene: NavigationSceneConfig, groupId: string) {
  const group = scene.groups.find((item) => item.id === groupId)
  if (!group) error(404, 'GROUP_NOT_FOUND', '指定分组不存在')
  return group
}

function findBookmark(navigation: NavigationConfig, slug: string) {
  const bookmark = navigation.bookmarks.find((item) => item.slug === slug)
  if (!bookmark) error(404, 'BOOKMARK_NOT_FOUND', '指定书签不存在')
  return bookmark
}

function findQuickRecord(scene: NavigationSceneConfig, recordId: string) {
  const record = scene.quickRecords.find((item) => item.id === recordId)
  if (!record) error(404, 'QUICK_RECORD_NOT_FOUND', '指定快速记录不存在')
  return record
}

function buildUniqueId(source: string, occupied: Iterable<string>, fallback: string) {
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
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

function chooseRandomIcon() {
  return randomIconIds[randomInt(randomIconIds.length)] ?? 'bookmark'
}

function assertIcon(icon: string | null | undefined) {
  if (icon && !availableIconIdSet.has(icon)) {
    error(422, 'INVALID_ICON', `不支持的图标 ID：${icon}`)
  }
}

function assertInsertPosition(position: number | undefined, length: number) {
  if (position === undefined) return length
  if (position < 0 || position > length) {
    error(422, 'INVALID_POSITION', `位置必须介于 0 和 ${length} 之间`)
  }
  return position
}

function assertUniquePlacements(placements: ManagedPlacement[]) {
  const sceneIds = new Set<string>()
  placements.forEach((placement) => {
    if (sceneIds.has(placement.sceneId)) {
      error(422, 'DUPLICATE_SCENE_PLACEMENT', '同一书签在一个场景中只能有一个位置')
    }
    sceneIds.add(placement.sceneId)
  })
}

function cleanBookmark(input: BookmarkCreateInput | (BookmarkPatchInput & ServiceConfig)) {
  assertIcon(input.icon)
  try {
    return serviceConfigSchema.parse({
      slug: input.slug,
      name: input.name,
      primaryUrl: input.primaryUrl,
      ...(input.note ? { note: input.note.trim() } : {}),
      ...(input.icon ? { icon: input.icon } : {}),
      ...(input.secondaryUrl ? { secondaryUrl: input.secondaryUrl } : {}),
      ...(input.probes && input.probes.length > 0 ? { probes: input.probes } : {}),
      ...(input.forceNewTab ? { forceNewTab: true } : {}),
    })
  } catch (cause) {
    if (cause instanceof ZodError) {
      error(422, 'INVALID_BOOKMARK', cause.issues[0]?.message ?? '书签字段无效')
    }
    throw cause
  }
}

function insertPlacement(
  navigation: NavigationConfig,
  slug: string,
  placement: ManagedPlacement,
  mode: 'add' | 'move' = 'add'
) {
  const scene = findScene(navigation, placement.sceneId)
  const group = findGroup(scene, placement.groupId)
  const currentGroup = scene.groups.find((item) => item.bookmarkIds.includes(slug))

  if (mode === 'add' && currentGroup) {
    error(409, 'PLACEMENT_CONFLICT', `书签已位于场景“${scene.name}”的分组中`)
  }

  scene.groups.forEach((item) => {
    item.bookmarkIds = item.bookmarkIds.filter((id) => id !== slug)
  })
  const position = assertInsertPosition(placement.position, group.bookmarkIds.length)
  group.bookmarkIds.splice(position, 0, slug)
}

function removeOrphanBookmarks(navigation: NavigationConfig, candidates?: Iterable<string>) {
  const referenced = new Set(
    navigation.scenes.flatMap((scene) => scene.groups.flatMap((group) => group.bookmarkIds))
  )
  const candidateSet = candidates ? new Set(candidates) : null
  const deleted: string[] = []
  navigation.bookmarks = navigation.bookmarks.filter((bookmark) => {
    const shouldDelete =
      !referenced.has(bookmark.slug) && (!candidateSet || candidateSet.has(bookmark.slug))
    if (shouldDelete) deleted.push(bookmark.slug)
    return !shouldDelete
  })
  return deleted
}

export function getBookmarkPlacements(navigation: NavigationConfig, slug: string) {
  return navigation.scenes.flatMap((scene) =>
    scene.groups.flatMap((group) => {
      const position = group.bookmarkIds.indexOf(slug)
      return position >= 0 ? [{ sceneId: scene.id, groupId: group.id, position }] : []
    })
  )
}

export function toManagedState(navigation: NavigationConfig) {
  return {
    defaultSceneId: navigation.defaultSceneId,
    scenes: navigation.scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      protected: scene.protected,
      groups: scene.groups.map((group, position) => ({
        id: group.id,
        name: group.name,
        position,
        bookmarkIds: [...group.bookmarkIds],
      })),
      quickRecords: scene.quickRecords.map((record) => ({ ...record })),
    })),
    bookmarks: navigation.bookmarks.map((bookmark) => ({
      ...bookmark,
      probes: bookmark.probes ? [...bookmark.probes] : undefined,
      placements: getBookmarkPlacements(navigation, bookmark.slug),
    })),
  }
}

export function getNavigationRevision(navigation: NavigationConfig) {
  const payload = JSON.stringify(toManagedState(navigation))
  return `sha256:${createHash('sha256').update(payload).digest('hex')}`
}

export function getManagementCounts(navigation: NavigationConfig) {
  return {
    scenes: navigation.scenes.length,
    groups: navigation.scenes.reduce((count, scene) => count + scene.groups.length, 0),
    bookmarks: navigation.bookmarks.length,
    quickRecords: navigation.scenes.reduce(
      (count, scene) => count + scene.quickRecords.length,
      0
    ),
  }
}

export function searchManagedNavigation(
  navigation: NavigationConfig,
  query: string,
  sceneId: string,
  type: 'bookmark' | 'quick-record' | 'all'
) {
  const needle = query.trim().toLocaleLowerCase()
  const selectedScene = sceneId === 'all' ? null : findScene(navigation, sceneId)
  const bookmarkResults =
    type === 'quick-record'
      ? []
      : navigation.bookmarks.flatMap((bookmark) => {
          const placements = getBookmarkPlacements(navigation, bookmark.slug).filter(
            (placement) => !selectedScene || placement.sceneId === selectedScene.id
          )
          if (placements.length === 0) return []
          const haystack = [
            bookmark.slug,
            bookmark.name,
            bookmark.primaryUrl,
            bookmark.secondaryUrl ?? '',
            bookmark.note ?? '',
          ]
            .join('\n')
            .toLocaleLowerCase()
          return haystack.includes(needle) ? [{ type: 'bookmark' as const, ...bookmark, placements }] : []
        })
  const scenes = selectedScene ? [selectedScene] : navigation.scenes
  const quickRecordResults =
    type === 'bookmark'
      ? []
      : scenes.flatMap((scene) =>
          scene.quickRecords.flatMap((record) => {
            const haystack = [
              record.id,
              record.name,
              record.primaryUrl,
              record.secondaryUrl ?? '',
              record.note ?? '',
            ]
              .join('\n')
              .toLocaleLowerCase()
            return haystack.includes(needle)
              ? [{ type: 'quick-record' as const, sceneId: scene.id, ...record }]
              : []
          })
        )
  return [...bookmarkResults, ...quickRecordResults]
}

export function listManagedIcons(query: string, limit: number) {
  const needle = query.trim().toLocaleLowerCase().replace(/[\s_]+/g, '-')
  return availableIconIds
    .filter((id) => !needle || id.includes(needle))
    .slice(0, limit)
    .map((id) => ({
      id,
      label: id
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(''),
    }))
}

export function createManagedGroup(
  navigation: NavigationConfig,
  sceneId: string,
  input: { id?: string; name: string; position?: number }
) {
  const next = cloneNavigation(navigation)
  const scene = findScene(next, sceneId)
  const name = input.name.trim()
  if (scene.groups.some((group) => group.name === name)) {
    error(409, 'GROUP_NAME_CONFLICT', `分组名称已存在：${name}`)
  }
  if (input.id && scene.groups.some((group) => group.id === input.id)) {
    error(409, 'GROUP_ID_CONFLICT', `分组 ID 已存在：${input.id}`)
  }
  const group = {
    id: input.id ?? buildUniqueId(name, scene.groups.map((item) => item.id), 'group'),
    name,
    bookmarkIds: [],
  }
  scene.groups.splice(assertInsertPosition(input.position, scene.groups.length), 0, group)
  return { navigation: next, result: { group } }
}

export function renameManagedGroup(
  navigation: NavigationConfig,
  sceneId: string,
  groupId: string,
  nameInput: string
) {
  const next = cloneNavigation(navigation)
  const scene = findScene(next, sceneId)
  const group = findGroup(scene, groupId)
  const name = nameInput.trim()
  if (scene.groups.some((item) => item.id !== groupId && item.name === name)) {
    error(409, 'GROUP_NAME_CONFLICT', `分组名称已存在：${name}`)
  }
  group.name = name
  return { navigation: next, result: { group } }
}

export function reorderManagedGroups(
  navigation: NavigationConfig,
  sceneId: string,
  groupIds: string[]
) {
  const next = cloneNavigation(navigation)
  const scene = findScene(next, sceneId)
  const supplied = new Set(groupIds)
  if (
    supplied.size !== groupIds.length ||
    groupIds.length !== scene.groups.length ||
    scene.groups.some((group) => !supplied.has(group.id))
  ) {
    error(409, 'GROUP_ORDER_CONFLICT', '分组顺序必须完整包含当前场景的每个分组且不能重复')
  }
  const groups = new Map(scene.groups.map((group) => [group.id, group]))
  scene.groups = groupIds.map((id) => groups.get(id)!)
  return { navigation: next, result: { groupIds } }
}

export function deleteManagedGroup(
  navigation: NavigationConfig,
  sceneId: string,
  groupId: string,
  input: {
    bookmarkDisposition: 'reject' | 'remove' | 'move'
    targetGroupId?: string
    targetPosition?: number
  }
) {
  const next = cloneNavigation(navigation)
  const scene = findScene(next, sceneId)
  const group = findGroup(scene, groupId)
  const removedBookmarkIds = [...group.bookmarkIds]
  if (removedBookmarkIds.length > 0 && input.bookmarkDisposition === 'reject') {
    error(409, 'GROUP_NOT_EMPTY', '分组非空，请明确选择移动或移除其中的书签')
  }
  if (input.bookmarkDisposition === 'move') {
    if (!input.targetGroupId || input.targetGroupId === groupId) {
      error(422, 'INVALID_TARGET_GROUP', '必须指定另一个目标分组')
    }
    const target = findGroup(scene, input.targetGroupId)
    const position = assertInsertPosition(input.targetPosition, target.bookmarkIds.length)
    target.bookmarkIds.splice(position, 0, ...removedBookmarkIds)
  }
  scene.groups = scene.groups.filter((item) => item.id !== groupId)
  const deletedBookmarks =
    input.bookmarkDisposition === 'remove'
      ? removeOrphanBookmarks(next, removedBookmarkIds)
      : []
  return {
    navigation: next,
    result: { groupId, removedBookmarkIds, deletedBookmarks },
  }
}

export function createManagedBookmark(navigation: NavigationConfig, input: BookmarkCreateInput) {
  const next = cloneNavigation(navigation)
  assertUniquePlacements(input.placements)
  const slug =
    input.slug ?? buildUniqueId(input.name, next.bookmarks.map((item) => item.slug), 'bookmark')
  if (next.bookmarks.some((bookmark) => bookmark.slug === slug)) {
    error(409, 'BOOKMARK_SLUG_CONFLICT', `书签 slug 已存在：${slug}`)
  }
  const bookmark = cleanBookmark({ ...input, slug, icon: input.icon ?? chooseRandomIcon() })
  next.bookmarks.push(bookmark)
  input.placements.forEach((placement) => insertPlacement(next, bookmark.slug, placement))
  return {
    navigation: next,
    result: { bookmark: { ...bookmark, placements: getBookmarkPlacements(next, bookmark.slug) } },
  }
}

export function updateManagedBookmark(
  navigation: NavigationConfig,
  currentSlug: string,
  patch: BookmarkPatchInput
) {
  const next = cloneNavigation(navigation)
  const current = findBookmark(next, currentSlug)
  const nextSlug = patch.slug ?? current.slug
  if (
    nextSlug !== current.slug &&
    next.bookmarks.some((bookmark) => bookmark.slug === nextSlug)
  ) {
    error(409, 'BOOKMARK_SLUG_CONFLICT', `书签 slug 已存在：${nextSlug}`)
  }
  const merged = cleanBookmark({
    ...current,
    ...patch,
    slug: nextSlug,
    note: patch.note === null ? undefined : (patch.note ?? current.note),
    icon: patch.icon === null ? undefined : (patch.icon ?? current.icon),
    secondaryUrl:
      patch.secondaryUrl === null ? undefined : (patch.secondaryUrl ?? current.secondaryUrl),
    probes: patch.probes === null ? undefined : (patch.probes ?? current.probes),
    forceNewTab: patch.forceNewTab === null ? undefined : (patch.forceNewTab ?? current.forceNewTab),
  })
  const index = next.bookmarks.findIndex((bookmark) => bookmark.slug === currentSlug)
  next.bookmarks[index] = merged
  if (nextSlug !== currentSlug) {
    next.scenes.forEach((scene) =>
      scene.groups.forEach((group) => {
        group.bookmarkIds = group.bookmarkIds.map((id) => (id === currentSlug ? nextSlug : id))
      })
    )
  }
  return {
    navigation: next,
    result: { bookmark: { ...merged, placements: getBookmarkPlacements(next, nextSlug) } },
  }
}

export function duplicateManagedBookmark(
  navigation: NavigationConfig,
  sourceSlug: string,
  input: { slug?: string; name?: string; placements?: ManagedPlacement[] }
) {
  const next = cloneNavigation(navigation)
  const source = findBookmark(next, sourceSlug)
  const slug =
    input.slug ??
    buildUniqueId(`${source.slug}-copy`, next.bookmarks.map((item) => item.slug), 'bookmark-copy')
  if (next.bookmarks.some((bookmark) => bookmark.slug === slug)) {
    error(409, 'BOOKMARK_SLUG_CONFLICT', `书签 slug 已存在：${slug}`)
  }
  const bookmark = cleanBookmark({
    ...source,
    slug,
    name: input.name ?? source.name,
    placements: [],
  })
  next.bookmarks.push(bookmark)
  const placements = input.placements ?? getBookmarkPlacements(next, sourceSlug)
  assertUniquePlacements(placements)
  if (placements.length === 0) {
    error(422, 'PLACEMENT_REQUIRED', '复制书签至少需要一个放置位置')
  }
  if (input.placements) {
    placements.forEach((placement) => insertPlacement(next, slug, placement))
  } else {
    placements.forEach((placement) =>
      insertPlacement(next, slug, { ...placement, position: placement.position! + 1 })
    )
  }
  return {
    navigation: next,
    result: { bookmark: { ...bookmark, placements: getBookmarkPlacements(next, slug) } },
  }
}

export function deleteManagedBookmark(navigation: NavigationConfig, slug: string) {
  const next = cloneNavigation(navigation)
  const bookmark = findBookmark(next, slug)
  const placements = getBookmarkPlacements(next, slug)
  next.bookmarks = next.bookmarks.filter((item) => item.slug !== slug)
  next.scenes.forEach((scene) =>
    scene.groups.forEach((group) => {
      group.bookmarkIds = group.bookmarkIds.filter((id) => id !== slug)
    })
  )
  return { navigation: next, result: { bookmark, placements } }
}

export function setManagedPlacement(
  navigation: NavigationConfig,
  sceneId: string,
  slug: string,
  input: { groupId: string; position?: number }
) {
  const next = cloneNavigation(navigation)
  findBookmark(next, slug)
  insertPlacement(next, slug, { sceneId, ...input }, 'move')
  return {
    navigation: next,
    result: { placement: getBookmarkPlacements(next, slug).find((item) => item.sceneId === sceneId) },
  }
}

export function removeManagedPlacement(
  navigation: NavigationConfig,
  sceneId: string,
  slug: string,
  orphanPolicy: 'reject' | 'delete'
) {
  const next = cloneNavigation(navigation)
  findBookmark(next, slug)
  const scene = findScene(next, sceneId)
  const placements = getBookmarkPlacements(next, slug)
  const placement = placements.find((item) => item.sceneId === sceneId)
  if (!placement) error(404, 'PLACEMENT_NOT_FOUND', '书签在指定场景中没有位置')
  if (placements.length === 1 && orphanPolicy === 'reject') {
    error(409, 'ORPHAN_BOOKMARK', '这是书签的最后一个位置，请明确允许删除书签定义')
  }
  scene.groups.forEach((group) => {
    group.bookmarkIds = group.bookmarkIds.filter((id) => id !== slug)
  })
  const deletedBookmark = placements.length === 1
  if (deletedBookmark) next.bookmarks = next.bookmarks.filter((item) => item.slug !== slug)
  return { navigation: next, result: { placement, deletedBookmark } }
}

export function batchMoveManagedBookmarks(
  navigation: NavigationConfig,
  sceneId: string,
  bookmarkIds: string[],
  targetGroupId: string,
  position?: number
) {
  const next = cloneNavigation(navigation)
  const scene = findScene(next, sceneId)
  const target = findGroup(scene, targetGroupId)
  const requested = new Set(bookmarkIds)
  if (requested.size !== bookmarkIds.length) {
    error(422, 'DUPLICATE_BOOKMARK_ID', '批量书签 ID 不能重复')
  }
  bookmarkIds.forEach((slug) => findBookmark(next, slug))
  const ordered = scene.groups.flatMap((group) =>
    group.bookmarkIds.filter((slug) => requested.has(slug))
  )
  if (ordered.length !== bookmarkIds.length) {
    error(404, 'PLACEMENT_NOT_FOUND', '至少一个书签不在指定场景中')
  }
  scene.groups.forEach((group) => {
    group.bookmarkIds = group.bookmarkIds.filter((slug) => !requested.has(slug))
  })
  target.bookmarkIds.splice(assertInsertPosition(position, target.bookmarkIds.length), 0, ...ordered)
  return { navigation: next, result: { bookmarkIds: ordered, targetGroupId } }
}

export function batchPlaceManagedBookmarks(
  navigation: NavigationConfig,
  bookmarkIds: string[],
  placements: ManagedPlacement[],
  conflictPolicy: 'move' | 'skip' | 'reject'
) {
  const next = cloneNavigation(navigation)
  if (new Set(bookmarkIds).size !== bookmarkIds.length) {
    error(422, 'DUPLICATE_BOOKMARK_ID', '批量书签 ID 不能重复')
  }
  assertUniquePlacements(placements)
  bookmarkIds.forEach((slug) => findBookmark(next, slug))
  placements.forEach((placement) => {
    const scene = findScene(next, placement.sceneId)
    findGroup(scene, placement.groupId)
    bookmarkIds.forEach((slug) => {
      const currentGroup = scene.groups.find((group) => group.bookmarkIds.includes(slug))
      if (currentGroup?.id === placement.groupId) return
      if (currentGroup && conflictPolicy === 'reject') {
        error(409, 'PLACEMENT_CONFLICT', `书签 ${slug} 已位于场景 ${scene.id} 的其他分组`)
      }
      if (currentGroup && conflictPolicy === 'skip') return
      if (currentGroup) {
        currentGroup.bookmarkIds = currentGroup.bookmarkIds.filter((id) => id !== slug)
      }
      const target = findGroup(scene, placement.groupId)
      if (!target.bookmarkIds.includes(slug)) target.bookmarkIds.push(slug)
    })
  })
  return {
    navigation: next,
    result: {
      bookmarks: bookmarkIds.map((slug) => ({ slug, placements: getBookmarkPlacements(next, slug) })),
    },
  }
}

export function batchRemoveManagedBookmarks(
  navigation: NavigationConfig,
  sceneId: string,
  bookmarkIds: string[],
  orphanPolicy: 'reject' | 'delete'
) {
  const next = cloneNavigation(navigation)
  if (new Set(bookmarkIds).size !== bookmarkIds.length) {
    error(422, 'DUPLICATE_BOOKMARK_ID', '批量书签 ID 不能重复')
  }
  const scene = findScene(next, sceneId)
  bookmarkIds.forEach((slug) => {
    findBookmark(next, slug)
    const placements = getBookmarkPlacements(next, slug)
    if (!placements.some((placement) => placement.sceneId === sceneId)) {
      error(404, 'PLACEMENT_NOT_FOUND', `书签 ${slug} 不在指定场景中`)
    }
    if (placements.length === 1 && orphanPolicy === 'reject') {
      error(409, 'ORPHAN_BOOKMARK', `书签 ${slug} 只有这一个位置`)
    }
  })
  const ids = new Set(bookmarkIds)
  scene.groups.forEach((group) => {
    group.bookmarkIds = group.bookmarkIds.filter((slug) => !ids.has(slug))
  })
  const deletedBookmarks =
    orphanPolicy === 'delete' ? removeOrphanBookmarks(next, bookmarkIds) : []
  return { navigation: next, result: { removedBookmarkIds: bookmarkIds, deletedBookmarks } }
}

export function reorderManagedBookmarks(
  navigation: NavigationConfig,
  sceneId: string,
  groupId: string,
  bookmarkIds: string[]
) {
  const next = cloneNavigation(navigation)
  const group = findGroup(findScene(next, sceneId), groupId)
  const supplied = new Set(bookmarkIds)
  if (
    supplied.size !== bookmarkIds.length ||
    bookmarkIds.length !== group.bookmarkIds.length ||
    group.bookmarkIds.some((slug) => !supplied.has(slug))
  ) {
    error(409, 'BOOKMARK_ORDER_CONFLICT', '书签顺序必须完整包含当前分组的每个书签且不能重复')
  }
  group.bookmarkIds = [...bookmarkIds]
  return { navigation: next, result: { bookmarkIds } }
}

function createQuickRecordValue(input: QuickRecordInput, now: number): QuickRecord {
  assertIcon(input.icon)
  return {
    id: `quick-${now.toString(36)}-${randomInt(1000, 9999)}`,
    name: input.name.trim(),
    primaryUrl: input.primaryUrl,
    ...(input.secondaryUrl ? { secondaryUrl: input.secondaryUrl } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(input.icon ? { icon: input.icon } : { icon: chooseRandomIcon() }),
    createdAt: now,
    updatedAt: now,
  }
}

export function createManagedQuickRecord(
  navigation: NavigationConfig,
  sceneId: string,
  input: QuickRecordInput,
  now = Date.now()
) {
  const next = cloneNavigation(navigation)
  const scene = findScene(next, sceneId)
  const record = createQuickRecordValue(input, now)
  scene.quickRecords.push(record)
  return { navigation: next, result: { quickRecord: record } }
}

export function updateManagedQuickRecord(
  navigation: NavigationConfig,
  sceneId: string,
  recordId: string,
  patch: QuickRecordPatchInput,
  now = Date.now()
) {
  const next = cloneNavigation(navigation)
  const scene = findScene(next, sceneId)
  const current = findQuickRecord(scene, recordId)
  assertIcon(patch.icon)
  const record: QuickRecord = {
    ...current,
    ...patch,
    name: patch.name?.trim() ?? current.name,
    note: patch.note === null ? undefined : (patch.note?.trim() ?? current.note),
    icon: patch.icon === null ? undefined : (patch.icon ?? current.icon),
    secondaryUrl:
      patch.secondaryUrl === null ? undefined : (patch.secondaryUrl ?? current.secondaryUrl),
    updatedAt: now,
  }
  const index = scene.quickRecords.findIndex((item) => item.id === recordId)
  scene.quickRecords[index] = record
  return { navigation: next, result: { quickRecord: record } }
}

export function deleteManagedQuickRecord(
  navigation: NavigationConfig,
  sceneId: string,
  recordId: string
) {
  const next = cloneNavigation(navigation)
  const scene = findScene(next, sceneId)
  const record = findQuickRecord(scene, recordId)
  scene.quickRecords = scene.quickRecords.filter((item) => item.id !== recordId)
  return { navigation: next, result: { quickRecord: record } }
}

export function promoteManagedQuickRecord(
  navigation: NavigationConfig,
  sourceSceneId: string,
  recordId: string,
  input: { slug?: string; placements: ManagedPlacement[]; reuseExistingByUrl: boolean }
) {
  const next = cloneNavigation(navigation)
  const sourceScene = findScene(next, sourceSceneId)
  const record = findQuickRecord(sourceScene, recordId)
  assertUniquePlacements(input.placements)
  let bookmark = input.reuseExistingByUrl
    ? next.bookmarks.find((item) =>
        bookmarkMatchesAnyUrl(item, [record.primaryUrl, record.secondaryUrl])
      )
    : undefined
  let created = false
  if (!bookmark) {
    const slug =
      input.slug ?? buildUniqueId(record.name, next.bookmarks.map((item) => item.slug), 'bookmark')
    if (next.bookmarks.some((item) => item.slug === slug)) {
      error(409, 'BOOKMARK_SLUG_CONFLICT', `书签 slug 已存在：${slug}`)
    }
    bookmark = cleanBookmark({
      slug,
      name: record.name,
      note: record.note,
      icon: record.icon,
      primaryUrl: record.primaryUrl,
      secondaryUrl: record.secondaryUrl,
      placements: input.placements,
    })
    next.bookmarks.push(bookmark)
    created = true
  }
  input.placements.forEach((placement) => insertPlacement(next, bookmark!.slug, placement, 'move'))
  sourceScene.quickRecords = sourceScene.quickRecords.filter((item) => item.id !== recordId)
  return {
    navigation: next,
    result: {
      created,
      bookmark: { ...bookmark, placements: getBookmarkPlacements(next, bookmark.slug) },
      removedQuickRecordId: recordId,
    },
  }
}

export function fillMissingManagedIcons(
  navigation: NavigationConfig,
  sceneIds?: string[]
) {
  const next = cloneNavigation(navigation)
  const selectedScenes = sceneIds?.map((sceneId) => findScene(next, sceneId)) ?? next.scenes
  const selectedSceneIds = new Set(selectedScenes.map((scene) => scene.id))
  const bookmarkIds = new Set(
    next.scenes
      .filter((scene) => selectedSceneIds.has(scene.id))
      .flatMap((scene) => scene.groups.flatMap((group) => group.bookmarkIds))
  )
  let updatedBookmarks = 0
  let updatedQuickRecords = 0
  next.bookmarks.forEach((bookmark) => {
    if (bookmarkIds.has(bookmark.slug) && !bookmark.icon) {
      bookmark.icon = chooseRandomIcon()
      updatedBookmarks += 1
    }
  })
  selectedScenes.forEach((scene) =>
    scene.quickRecords.forEach((record) => {
      if (!record.icon) {
        record.icon = chooseRandomIcon()
        updatedQuickRecords += 1
      }
    })
  )
  return { navigation: next, result: { updatedBookmarks, updatedQuickRecords } }
}
