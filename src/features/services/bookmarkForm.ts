import { ZodError } from 'zod'
import type { NavigationConfig, ServiceConfig } from '@/config/schema'
import { getCurrentMessages } from '@/i18n/runtime'
import { cleanServiceConfig, slugify } from '@/features/services/servicesConfig'
import { getRandomBookmarkIcon } from '@/features/services/randomBookmarkIcon'
import {
  buildUniqueNavigationId,
  createSceneGroup,
  getBookmarkPlacements,
  type BookmarkPlacement,
} from '@/features/navigation/navigationConfig'

export interface BookmarkPlacementFormValue {
  sceneId: string
  groupId: string
  newGroupName: string
}

export interface BookmarkFormValues {
  placements: BookmarkPlacementFormValue[]
  name: string
  note?: string
  slug: string
  icon: string
  primaryUrl: string
  secondaryUrl: string
  forceNewTab: boolean
}

interface ValidateBookmarkFormOptions {
  currentSlug?: string
}

/**
 * Quick records are intentionally not normal bookmarks yet.  They do not
 * need a slug or a placement, so validate only the fields that are persisted
 * on the record.  Keeping this separate prevents an empty-placement save
 * from being rejected by normal bookmark rules (for example a duplicate or
 * manually edited slug).
 */
export function validateQuickRecordForm(values: BookmarkFormValues) {
  const bookmark = cleanServiceConfig({
    slug: 'quick-record',
    name: values.name.trim(),
    note: values.note?.trim() ?? '',
    icon: values.icon.trim() || undefined,
    primaryUrl: values.primaryUrl.trim(),
    secondaryUrl: values.secondaryUrl.trim(),
    forceNewTab: values.forceNewTab,
  })

  return { bookmark }
}

function getNextBookmarkIndex(config: NavigationConfig) {
  return config.bookmarks.length + 1
}

function createPlacement(
  config: NavigationConfig,
  sceneId: string,
  groupId?: string | null
): BookmarkPlacementFormValue {
  const scene = config.scenes.find((item) => item.id === sceneId) ?? config.scenes[0]
  return {
    sceneId: scene.id,
    groupId: scene.groups.some((group) => group.id === groupId)
      ? (groupId ?? '')
      : (scene.groups[0]?.id ?? ''),
    newGroupName: '',
  }
}

export function createEmptyBookmarkForm(
  config: NavigationConfig,
  sceneId?: string | null,
  groupId?: string | null,
  options?: { blank?: boolean; withoutPlacement?: boolean }
): BookmarkFormValues {
  const messages = getCurrentMessages()
  const nextIndex = getNextBookmarkIndex(config)
  const targetSceneId =
    config.scenes.find((scene) => scene.id === sceneId)?.id ?? config.defaultSceneId

  return {
    placements: options?.withoutPlacement ? [] : [createPlacement(config, targetSceneId, groupId)],
    name: options?.blank ? '' : messages.common.newBookmarkName(nextIndex),
    note: '',
    slug: buildUniqueNavigationId(
      `service-${nextIndex}`,
      config.bookmarks.map((bookmark) => bookmark.slug),
      'bookmark'
    ),
    icon: getRandomBookmarkIcon(),
    primaryUrl: options?.blank ? '' : 'http://127.0.0.1',
    secondaryUrl: '',
    forceNewTab: false,
  }
}

export function createBookmarkFormFromService(
  config: NavigationConfig,
  service: ServiceConfig
): BookmarkFormValues {
  return {
    placements: getBookmarkPlacements(config, service.slug).map((placement) => ({
      ...placement,
      newGroupName: '',
    })),
    name: service.name,
    ...(service.note ? { note: service.note } : {}),
    slug: service.slug,
    icon: service.icon ?? '',
    primaryUrl: service.primaryUrl,
    secondaryUrl: service.secondaryUrl ?? '',
    forceNewTab: service.forceNewTab ?? false,
  }
}

export function createDuplicateBookmarkForm(
  config: NavigationConfig,
  service: ServiceConfig
): BookmarkFormValues {
  return {
    ...createBookmarkFormFromService(config, service),
    slug: buildUniqueNavigationId(
      `${service.slug}-copy`,
      config.bookmarks.map((bookmark) => bookmark.slug),
      'bookmark'
    ),
  }
}

export function buildSuggestedSlug(
  name: string,
  config: NavigationConfig,
  currentSlug?: string,
  fallback?: string
) {
  const occupied = config.bookmarks
    .map((bookmark) => bookmark.slug)
    .filter((slug) => slug !== currentSlug)
  const normalized = slugify(name, fallback?.trim() || currentSlug || 'bookmark')
  return buildUniqueNavigationId(normalized, occupied, fallback?.trim() || 'bookmark')
}

export function validateBookmarkForm(
  values: BookmarkFormValues,
  config: NavigationConfig,
  options?: ValidateBookmarkFormOptions
) {
  const messages = getCurrentMessages()
  const nextSlug =
    values.slug.trim() || buildSuggestedSlug(values.name, config, options?.currentSlug)
  const bookmark = cleanServiceConfig({
    slug: nextSlug,
    name: values.name.trim(),
    note: values.note?.trim() ?? '',
    icon: values.icon.trim() || undefined,
    primaryUrl: values.primaryUrl.trim(),
    secondaryUrl: values.secondaryUrl.trim(),
    forceNewTab: values.forceNewTab,
  })

  if (
    config.bookmarks.some(
      (item) => item.slug === bookmark.slug && item.slug !== options?.currentSlug
    )
  ) {
    throw new Error(messages.errors.bookmarkSlugExists(bookmark.slug))
  }
  if (values.placements.length === 0) {
    throw new Error('请至少选择一个场景和分组')
  }

  const seenScenes = new Set<string>()
  const groupsToCreate: Array<{ sceneId: string; name: string }> = []
  const placements: BookmarkPlacement[] = values.placements.map((placement) => {
    const scene = config.scenes.find((item) => item.id === placement.sceneId)
    if (!scene || seenScenes.has(scene.id)) {
      throw new Error('书签场景选择无效或重复')
    }
    seenScenes.add(scene.id)

    if (scene.groups.length === 0) {
      const group = createSceneGroup(scene, placement.newGroupName)
      groupsToCreate.push({ sceneId: scene.id, name: group.name })
      return { sceneId: scene.id, groupId: group.id }
    }

    if (!scene.groups.some((group) => group.id === placement.groupId)) {
      throw new Error(messages.errors.selectBookmarkGroup)
    }
    return { sceneId: scene.id, groupId: placement.groupId }
  })

  return { bookmark, placements, groupsToCreate }
}

export function formatBookmarkError(error: unknown) {
  const messages = getCurrentMessages()
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0]
    const field = String(firstIssue?.path?.[0] ?? '')
    if (field === 'name') return messages.errors.bookmarkNameRequired
    if (field === 'slug') return messages.errors.bookmarkSlugFormat
    if (field === 'primaryUrl') return messages.errors.primaryUrlInvalid
    if (field === 'secondaryUrl') return messages.errors.secondaryUrlInvalid
    return firstIssue?.message ?? messages.errors.validationFailed
  }
  return error instanceof Error ? error.message : messages.common.genericActionFailed
}
