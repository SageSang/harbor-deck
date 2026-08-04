import type { NavigationConfig } from '@/config/schema'
import { getCurrentMessages } from '@/i18n/runtime'
import { cleanServiceConfig } from '@/features/services/servicesConfig'
import { getRandomBookmarkIcon } from '@/features/services/randomBookmarkIcon'
import {
  buildUniqueNavigationId,
  cloneNavigationConfig,
  parseNavigationConfig,
} from '@/features/navigation/navigationConfig'

export interface ImportedBrowserBookmark {
  name: string
  url: string
  groupName?: string
}

export const IMPORTED_BOOKMARK_GROUP_NAME = '导入书签'

function isImportableBookmarkUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function deriveBookmarkName(name: string, url: string) {
  const trimmedName = name.trim()
  if (trimmedName) {
    return trimmedName
  }

  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '') || url
  } catch {
    return url
  }
}

function normalizeGroupPath(path: string[]) {
  const normalized = path.map((segment) => segment.trim()).filter(Boolean)
  return normalized.length > 0 ? normalized.join(' / ') : undefined
}

function collectBookmarksFromList(
  list: Element,
  currentPath: string[],
  bookmarks: ImportedBrowserBookmark[]
) {
  let pendingFolderPath: string[] | null = null

  Array.from(list.children).forEach((child) => {
    const tagName = child.tagName.toUpperCase()

    if (tagName === 'DT') {
      const directChildren = Array.from(child.children)
      const heading = directChildren.find((element) => element.tagName.toUpperCase() === 'H3')
      const anchor = directChildren.find(
        (element) => element.tagName.toUpperCase() === 'A' && element.getAttribute('href')
      )
      const nestedList = directChildren.find((element) => element.tagName.toUpperCase() === 'DL')

      if (anchor) {
        const url = anchor.getAttribute('href')?.trim() ?? ''

        if (isImportableBookmarkUrl(url)) {
          bookmarks.push({
            name: deriveBookmarkName(anchor.textContent ?? '', url),
            url,
            groupName: normalizeGroupPath(currentPath),
          })
        }
      }

      if (heading) {
        const folderName = heading.textContent?.trim() ?? ''
        const nextPath = folderName ? [...currentPath, folderName] : currentPath

        if (nestedList) {
          collectBookmarksFromList(nestedList, nextPath, bookmarks)
          pendingFolderPath = null
        } else {
          pendingFolderPath = nextPath
        }
      } else {
        pendingFolderPath = null
      }

      return
    }

    if (tagName === 'DL') {
      collectBookmarksFromList(child, pendingFolderPath ?? currentPath, bookmarks)
      pendingFolderPath = null
    }
  })
}

function buildImportedGroupName(baseName: string, occupiedNames: Set<string>) {
  const preferredName = `${baseName}(导入)`

  if (!occupiedNames.has(preferredName)) {
    return preferredName
  }

  let suffix = 2
  let candidateName = `${baseName}(导入${suffix})`

  while (occupiedNames.has(candidateName)) {
    suffix += 1
    candidateName = `${baseName}(导入${suffix})`
  }

  return candidateName
}

export function parseBrowserBookmarksHtml(input: string): ImportedBrowserBookmark[] {
  const messages = getCurrentMessages()
  const document = new DOMParser().parseFromString(input, 'text/html')
  const rootList = document.querySelector('dl')
  const bookmarks: ImportedBrowserBookmark[] = []

  if (rootList) {
    collectBookmarksFromList(rootList, [], bookmarks)
  } else {
    Array.from(document.querySelectorAll('a[href]')).forEach((anchor) => {
      const url = anchor.getAttribute('href')?.trim() ?? ''
      if (!isImportableBookmarkUrl(url)) {
        return
      }

      bookmarks.push({
        name: deriveBookmarkName(anchor.textContent ?? '', url),
        url,
      })
    })
  }

  if (bookmarks.length === 0) {
    throw new Error(messages.bookmarkManage.importSection.emptyState)
  }

  return bookmarks
}

export function importBrowserBookmarks(
  config: NavigationConfig,
  bookmarks: readonly ImportedBrowserBookmark[],
  sceneId: string,
  defaultGroupName: string = IMPORTED_BOOKMARK_GROUP_NAME
) {
  const messages = getCurrentMessages()

  if (bookmarks.length === 0) {
    throw new Error(messages.bookmarkManage.importSection.emptyState)
  }

  const nextConfig = cloneNavigationConfig(config)
  const scene = nextConfig.scenes.find((item) => item.id === sceneId)
  if (!scene) {
    throw new Error('导入目标场景不存在')
  }
  const targetScene = scene
  const groupsByName = new Map(targetScene.groups.map((group) => [group.name, group]))
  const occupiedGroupNames = new Set(groupsByName.keys())
  const resolvedImportGroups = new Map<string, string>()
  const occupiedGroupIds = new Set(targetScene.groups.map((group) => group.id))
  const occupiedBookmarkIds = new Set(nextConfig.bookmarks.map((bookmark) => bookmark.slug))

  function ensureDefaultGroup() {
    const existing = groupsByName.get(defaultGroupName)
    if (existing) {
      return existing
    }

    const nextGroup = {
      id: buildUniqueNavigationId(defaultGroupName, occupiedGroupIds, 'imported'),
      name: defaultGroupName,
      bookmarkIds: [],
    }
    targetScene.groups.push(nextGroup)
    groupsByName.set(defaultGroupName, nextGroup)
    occupiedGroupNames.add(defaultGroupName)
    occupiedGroupIds.add(nextGroup.id)
    return nextGroup
  }

  function ensureImportGroup(importGroupName: string) {
    const resolvedGroupName = resolvedImportGroups.get(importGroupName)
    if (resolvedGroupName) {
      return groupsByName.get(resolvedGroupName)!
    }

    const targetGroupName = occupiedGroupNames.has(importGroupName)
      ? buildImportedGroupName(importGroupName, occupiedGroupNames)
      : importGroupName

    const nextGroup = {
      id: buildUniqueNavigationId(targetGroupName, occupiedGroupIds, 'group'),
      name: targetGroupName,
      bookmarkIds: [],
    }
    targetScene.groups.push(nextGroup)
    groupsByName.set(targetGroupName, nextGroup)
    occupiedGroupNames.add(targetGroupName)
    occupiedGroupIds.add(nextGroup.id)
    resolvedImportGroups.set(importGroupName, targetGroupName)
    return nextGroup
  }

  bookmarks.forEach((bookmark) => {
    const targetGroup = bookmark.groupName
      ? ensureImportGroup(bookmark.groupName)
      : ensureDefaultGroup()
    const existingBookmark = nextConfig.bookmarks.find((item) => item.primaryUrl === bookmark.url)
    const name = deriveBookmarkName(bookmark.name, bookmark.url)
    const bookmarkConfig =
      existingBookmark ??
      cleanServiceConfig({
        slug: buildUniqueNavigationId(name, occupiedBookmarkIds, 'bookmark'),
        name,
        icon: getRandomBookmarkIcon(),
        primaryUrl: bookmark.url,
      })

    if (!existingBookmark) {
      nextConfig.bookmarks.push(bookmarkConfig)
      occupiedBookmarkIds.add(bookmarkConfig.slug)
    }

    const alreadyPlaced = targetScene.groups.some((group) =>
      group.bookmarkIds.includes(bookmarkConfig.slug)
    )
    if (!alreadyPlaced) {
      targetGroup.bookmarkIds.push(bookmarkConfig.slug)
    }
  })

  return parseNavigationConfig(nextConfig)
}
