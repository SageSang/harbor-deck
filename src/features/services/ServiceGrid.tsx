import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, ChevronRight, Copy, Pencil, Plus, Trash2, X } from 'lucide-react'
import { BookmarkBatchPlacementDialog } from '@/features/services/BookmarkBatchPlacementDialog'
import { GroupRenameDialog } from '@/features/services/GroupRenameDialog'
import { useI18n } from '@/i18n/runtime'
import { useAppStore } from '@/store/appStore'
import { useSystemConfig } from '@/features/config/useSystemConfig'
import { defaultSystemConfig } from '@/features/config/api'
import { useFeedback } from '@/features/feedback/useFeedback'
import { focusSearchInput, SEARCH_INPUT_ID } from '@/components/searchFocus'
import { LazyBookmarkEditDialog } from '@/features/services/LazyBookmarkEditDialog'
import { QuickRecordEditDialog } from '@/features/services/QuickRecordEditDialog'
import { cloneServicesConfig, defaultServicesConfig } from '@/features/services/servicesConfig'
import {
  findScene,
  addBookmarksToSceneGroups,
  getBookmarkPlacementConflicts,
  moveBookmarksInScene,
  renameGroupInScene,
  removeBookmarksFromScene,
  removeGroupFromScene,
  removeBookmarkFromScene,
  removeQuickRecordFromScene,
} from '@/features/navigation/navigationConfig'
import { useNavigationConfig, useSaveNavigationConfig } from '@/features/navigation/useNavigation'
import { ServiceCard } from './ServiceCard'
import {
  findBookmarkNavigationTarget,
  type BookmarkNavigationDirection,
  type BookmarkNavigationEntry,
} from './bookmarkNavigation'
import {
  getGroupKey,
  persistCollapsedGroupKeys,
  readCollapsedGroupKeys,
} from '@/features/navigation/groupPreference'
import { preloadServiceIcons } from './iconRegistry'
import { quickRecordMatchesSearch } from './quickRecordSearch'
import { useServices } from './useServices'

interface DragOverState {
  groupIndex: number
  serviceIndex?: number
}

interface BookmarkContextMenuState {
  kind: 'bookmark'
  slug: string
  x: number
  y: number
}

interface QuickRecordContextMenuState {
  kind: 'quick-record'
  recordId: string
  sceneId: string
  x: number
  y: number
}

interface GroupContextMenuState {
  kind: 'group'
  groupId: string
  groupName: string
  x: number
  y: number
}

interface SelectionContextMenuState {
  kind: 'selection'
  slugs: string[]
  x: number
  y: number
}

interface BookmarkDialogState {
  mode: 'edit' | 'duplicate' | 'create'
  slug: string | null
  initialSceneId?: string | null
  initialGroupId?: string | null
}

interface QuickRecordDialogState {
  recordId: string
  sceneId: string
}

interface GroupRenameState {
  groupId: string
  groupName: string
}

type ContextMenuState =
  | BookmarkContextMenuState
  | QuickRecordContextMenuState
  | GroupContextMenuState
  | SelectionContextMenuState
const DESKTOP_SECTION_HORIZONTAL_PADDING_PX = 24
// Keep the group label wide enough for normal folder paths while leaving a
// predictable amount of room for the desktop card columns. The label may wrap
// up to three lines; flex-row stretching keeps adjacent groups aligned.
const DESKTOP_LABEL_WIDTH_PX = 144
const DESKTOP_SECTION_GAP_PX = 12
const DESKTOP_GRID_HORIZONTAL_PADDING_PX = 12
const DESKTOP_CARD_GAP_PX = 10
const DESKTOP_CARD_MIN_WIDTH_PX = 130
const DESKTOP_COMPACT_CARD_PREFERRED_WIDTH_PX = 154
const DESKTOP_COMPACT_CARD_MAX_WIDTH_PX = 176
const LONG_PRESS_DELAY_MS = 550
const LONG_PRESS_MOVE_THRESHOLD_PX = 8

function getDesktopCardWidth(containerWidth: number, desktopColumnCount: number) {
  const availableWidth =
    containerWidth -
    DESKTOP_SECTION_HORIZONTAL_PADDING_PX -
    DESKTOP_LABEL_WIDTH_PX -
    DESKTOP_SECTION_GAP_PX -
    DESKTOP_GRID_HORIZONTAL_PADDING_PX -
    Math.max(desktopColumnCount - 1, 0) * DESKTOP_CARD_GAP_PX

  return Math.max(Math.floor(availableWidth / desktopColumnCount), DESKTOP_CARD_MIN_WIDTH_PX)
}

function getCompactGroupWidth(cardCount: number, desktopCardWidth: number) {
  return (
    DESKTOP_SECTION_HORIZONTAL_PADDING_PX +
    DESKTOP_LABEL_WIDTH_PX +
    DESKTOP_SECTION_GAP_PX +
    DESKTOP_GRID_HORIZONTAL_PADDING_PX +
    cardCount * desktopCardWidth +
    Math.max(cardCount - 1, 0) * DESKTOP_CARD_GAP_PX
  )
}

function isGroupCollapsedForView(
  activeSceneId: string | null,
  groupId: string,
  collapsedGroupKeys: ReadonlySet<string>,
  isSearchActive: boolean
) {
  return Boolean(
    !isSearchActive &&
    activeSceneId &&
    groupId &&
    collapsedGroupKeys.has(getGroupKey(activeSceneId, groupId))
  )
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    target.matches('input, textarea, select, [contenteditable="true"]')
  )
}

export function ServiceGrid() {
  const { groupedServices, isLoading, config } = useServices()
  const searchKeyword = useAppStore((state) => state.searchKeyword)
  const networkMode = useAppStore((state) => state.networkMode)
  const { data: systemConfig } = useSystemConfig()
  const navigationQuery = useNavigationConfig()
  const activeSceneId = useAppStore((state) => state.activeSceneId)
  const sceneTokens = useAppStore((state) => state.sceneTokens)
  const saveMutation = useSaveNavigationConfig()
  const { showToast, confirm } = useFeedback()
  const { messages } = useI18n()
  const [draggingSlugs, setDraggingSlugs] = useState<string[]>([])
  const [dragOver, setDragOver] = useState<DragOverState | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())
  const [bookmarkDialog, setBookmarkDialog] = useState<BookmarkDialogState | null>(null)
  const [quickRecordDialog, setQuickRecordDialog] = useState<QuickRecordDialogState | null>(null)
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(
    () => new Set(readCollapsedGroupKeys())
  )
  const [renamingGroup, setRenamingGroup] = useState<GroupRenameState | null>(null)
  const [gridWidth, setGridWidth] = useState(0)
  const [desktopColumnCount, setDesktopColumnCount] = useState(() => {
    if (typeof window === 'undefined') {
      return 0
    }

    if (window.innerWidth >= 1280) {
      return 8
    }

    if (window.innerWidth >= 1024) {
      return 6
    }

    return 0
  })
  const [, setIconRenderVersion] = useState(0)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const bookmarkRefs = useRef(new Map<string, HTMLDivElement>())
  const longPressTimerRef = useRef<number | null>(null)
  const longPressPointerRef = useRef<{ slug: string; x: number; y: number } | null>(null)
  const justLongPressedRef = useRef(false)
  const [focusedBookmarkSlug, setFocusedBookmarkSlug] = useState<string | null>(null)
  const activeSystemConfig = systemConfig ?? defaultSystemConfig

  const activeConfig = useMemo(() => cloneServicesConfig(config ?? defaultServicesConfig), [config])
  const isSearchActive = searchKeyword.trim().length > 0
  const canDrag = !isSearchActive && !saveMutation.isPending

  const quickRecordServices = useMemo(() => {
    if (!isSearchActive || !activeSceneId || !navigationQuery.data) return []
    const scene = findScene(navigationQuery.data, activeSceneId)
    const keyword = searchKeyword.trim().toLocaleLowerCase()
    return (scene?.quickRecords ?? [])
      .filter((record) => quickRecordMatchesSearch(record, keyword))
      .map((record) => ({
        slug: `quick-${record.id}`,
        name: record.name,
        icon: record.icon,
        primaryUrl: record.primaryUrl,
        ...(record.secondaryUrl ? { secondaryUrl: record.secondaryUrl } : {}),
        ...(record.note ? { note: record.note } : {}),
        forceNewTab: false,
        category: '快速记录',
      }))
  }, [activeSceneId, isSearchActive, navigationQuery.data, searchKeyword])

  const displayGroups = useMemo(() => {
    const scene =
      navigationQuery.data && activeSceneId
        ? findScene(navigationQuery.data, activeSceneId)
        : undefined

    return groupedServices
      .map((group) => {
        const actualGroupIndex = activeConfig.findIndex((item) => item.category === group.category)
        return {
          ...group,
          actualGroupIndex,
          groupId: scene?.groups[actualGroupIndex]?.id ?? '',
        }
      })
      .filter((group) => group.actualGroupIndex >= 0)
  }, [activeConfig, activeSceneId, groupedServices, navigationQuery.data])
  const renderGroups = useMemo(
    () =>
      quickRecordServices.length > 0
        ? [
            {
              category: '快速记录',
              services: quickRecordServices,
              actualGroupIndex: -1,
              groupId: '',
              isQuickRecordGroup: true,
            },
            ...displayGroups.map((group) => ({ ...group, isQuickRecordGroup: false })),
          ]
        : displayGroups.map((group) => ({ ...group, isQuickRecordGroup: false })),
    [displayGroups, quickRecordServices]
  )
  const visibleBookmarkEntries = useMemo<BookmarkNavigationEntry[]>(
    () =>
      renderGroups.flatMap((group, groupIndex) => {
        if (
          isGroupCollapsedForView(activeSceneId, group.groupId, collapsedGroupKeys, isSearchActive)
        ) {
          return []
        }

        return group.services.map((service, serviceIndex) => ({
          slug: service.slug,
          groupIndex,
          serviceIndex,
        }))
      }),
    [activeSceneId, collapsedGroupKeys, isSearchActive, renderGroups]
  )
  const firstVisibleBookmarkSlug = visibleBookmarkEntries[0]?.slug ?? null
  const lastVisibleBookmarkSlug =
    visibleBookmarkEntries[visibleBookmarkEntries.length - 1]?.slug ?? null
  const visibleServiceIcons = useMemo(
    () =>
      Array.from(
        new Set(
          renderGroups.flatMap((group) => {
            if (
              isGroupCollapsedForView(
                activeSceneId,
                group.groupId,
                collapsedGroupKeys,
                isSearchActive
              )
            ) {
              return []
            }
            return group.services.map((service) => service.icon)
          })
        )
      ),
    [activeSceneId, collapsedGroupKeys, isSearchActive, renderGroups]
  )

  useEffect(() => {
    let cancelled = false

    void preloadServiceIcons(visibleServiceIcons).then((loadedAny) => {
      if (cancelled || !loadedAny) {
        return
      }

      startTransition(() => {
        setIconRenderVersion((version) => version + 1)
      })
    })

    return () => {
      cancelled = true
    }
  }, [visibleServiceIcons])

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
      }
    }

    const closeMenu = () => setContextMenu(null)

    document.addEventListener('scroll', closeMenu, true)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('scroll', closeMenu, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  useEffect(() => {
    setSelectionMode(false)
    setSelectedSlugs(new Set())
    setFocusedBookmarkSlug(null)
  }, [activeSceneId, searchKeyword])

  useEffect(() => {
    function focusSearchBox() {
      setFocusedBookmarkSlug(null)
      focusSearchInput()
    }

    function focusBookmark(slug: string) {
      const element = bookmarkRefs.current.get(slug)
      if (!element) {
        return
      }
      setFocusedBookmarkSlug(slug)
      element.focus({ preventScroll: true })
      element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === '/' && !isEditableTarget(event.target)) {
        event.preventDefault()
        setContextMenu(null)
        focusSearchBox()
        return
      }

      if (
        !(event.target instanceof HTMLElement) ||
        event.target.id !== SEARCH_INPUT_ID ||
        event.altKey ||
        event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')
      ) {
        return
      }

      const slug = event.key === 'ArrowDown' ? firstVisibleBookmarkSlug : lastVisibleBookmarkSlug
      if (!slug) {
        return
      }
      event.preventDefault()
      focusBookmark(slug)
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [firstVisibleBookmarkSlug, lastVisibleBookmarkSlug])

  useEffect(() => {
    persistCollapsedGroupKeys(collapsedGroupKeys)
  }, [collapsedGroupKeys])

  useEffect(() => {
    if (selectionMode && selectedSlugs.size === 0) {
      setSelectionMode(false)
    }
  }, [selectedSlugs.size, selectionMode])

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const updateDesktopColumnCount = () => {
      setDesktopColumnCount((current) => {
        const next = window.innerWidth >= 1280 ? 8 : window.innerWidth >= 1024 ? 6 : 0

        return current === next ? current : next
      })
    }

    updateDesktopColumnCount()
    window.addEventListener('resize', updateDesktopColumnCount)

    return () => {
      window.removeEventListener('resize', updateDesktopColumnCount)
    }
  }, [])

  useEffect(() => {
    const element = gridRef.current
    if (!element) {
      return
    }

    const updateWidth = (width: number) => {
      setGridWidth((currentWidth) => (currentWidth === width ? currentWidth : width))
    }

    updateWidth(Math.round(element.getBoundingClientRect().width))

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      updateWidth(Math.round(entry.contentRect.width))
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [isLoading, renderGroups.length])

  function clearDragState() {
    setDraggingSlugs([])
    setDragOver(null)
  }

  function clearLongPress() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressPointerRef.current = null
  }

  function focusSearchBox() {
    setFocusedBookmarkSlug(null)
    focusSearchInput()
  }

  function focusBookmark(slug: string) {
    const element = bookmarkRefs.current.get(slug)
    if (!element) {
      return
    }
    setFocusedBookmarkSlug(slug)
    element.focus({ preventScroll: true })
    element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
  }

  function beginBookmarkLongPress(slug: string, event: MouseEvent<HTMLDivElement>) {
    if (selectionMode || event.button !== 0 || !canDrag) {
      return
    }

    clearLongPress()
    longPressPointerRef.current = { slug, x: event.clientX, y: event.clientY }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null
      longPressPointerRef.current = null
      justLongPressedRef.current = true
      setSelectionMode(true)
      setSelectedSlugs(new Set([slug]))
      clearDragState()
    }, LONG_PRESS_DELAY_MS)
  }

  function trackBookmarkLongPress(event: MouseEvent<HTMLDivElement>) {
    const pointer = longPressPointerRef.current
    if (!pointer) {
      return
    }

    const moved =
      Math.abs(event.clientX - pointer.x) > LONG_PRESS_MOVE_THRESHOLD_PX ||
      Math.abs(event.clientY - pointer.y) > LONG_PRESS_MOVE_THRESHOLD_PX
    if (moved) {
      clearLongPress()
    }
  }

  function finishBookmarkPress() {
    clearLongPress()
    if (justLongPressedRef.current) {
      window.setTimeout(() => {
        justLongPressedRef.current = false
      }, 0)
    }
  }

  function toggleBookmarkSelection(slug: string) {
    setSelectedSlugs((current) => {
      const next = new Set(current)
      if (next.has(slug)) {
        next.delete(slug)
      } else {
        next.add(slug)
      }
      return next
    })
  }

  function leaveSelectionMode() {
    setSelectionMode(false)
    setSelectedSlugs(new Set())
    setContextMenu(null)
  }

  function toggleGroupCollapse(groupId: string) {
    // Search results temporarily expand their matching groups. Keep the
    // persisted preference untouched while searching so clearing the query
    // restores exactly the state the user had before searching.
    if (!activeSceneId || isSearchActive) return
    const key = getGroupKey(activeSceneId, groupId)
    setCollapsedGroupKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function commitDrop(targetGroupIndex: number, targetServiceIndex?: number) {
    if (draggingSlugs.length === 0) {
      return
    }

    const navigation = navigationQuery.data
    const scene = navigation && activeSceneId ? findScene(navigation, activeSceneId) : undefined
    if (!navigation || !scene || !activeSceneId) {
      clearDragState()
      return
    }

    const targetGroup = scene.groups[targetGroupIndex]
    if (!targetGroup) {
      clearDragState()
      return
    }

    try {
      const nextConfig = moveBookmarksInScene(
        navigation,
        activeSceneId,
        draggingSlugs,
        targetGroup.id,
        targetServiceIndex
      )
      clearDragState()
      saveMutation.mutate(nextConfig, {
        onError: (error) => {
          showToast({
            type: 'error',
            message: error instanceof Error ? error.message : messages.common.saveFailedRetry,
          })
        },
      })
    } catch (error) {
      clearDragState()
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : messages.common.saveFailedRetry,
      })
    }
  }

  async function handleDeleteBookmark(slug: string) {
    const navigation = navigationQuery.data
    if (!navigation || !activeSceneId) {
      return
    }
    const service = navigation.bookmarks.find((bookmark) => bookmark.slug === slug)
    if (!service) return
    const serviceName = service.name
    setContextMenu(null)
    const confirmed = await confirm({
      title: messages.serviceGrid.confirmDeleteTitle,
      message: messages.serviceGrid.confirmDeleteMessage(serviceName),
      confirmLabel: messages.serviceGrid.confirmDeleteAction,
      cancelLabel: messages.common.cancel,
      variant: 'destructive',
    })

    if (!confirmed) {
      return
    }

    const nextConfig = removeBookmarkFromScene(navigation, activeSceneId, slug)
    saveMutation.mutate(nextConfig, {
      onSuccess: () => {
        showToast({ type: 'success', message: messages.serviceGrid.deleted(serviceName) })
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : messages.serviceGrid.deleteFailed
        showToast({ type: 'error', message })
      },
    })
  }

  async function handleDeleteQuickRecord(recordId: string, recordSceneId: string) {
    const navigation = navigationQuery.data
    const record = navigation
      ? findScene(navigation, recordSceneId)?.quickRecords?.find((item) => item.id === recordId)
      : undefined
    if (!navigation || !record) return
    setContextMenu(null)
    const confirmed = await confirm({
      title: '删除快速记录',
      message: `确定删除“${record.name}”吗？删除后无法恢复。`,
      confirmLabel: messages.serviceGrid.deleteAction,
      cancelLabel: messages.common.cancel,
      variant: 'destructive',
    })
    if (!confirmed) return
    const nextConfig = removeQuickRecordFromScene(navigation, recordSceneId, recordId)
    saveMutation.mutate(nextConfig, {
      onSuccess: () => showToast({ type: 'success', message: `记录“${record.name}”已删除。` }),
      onError: (error) =>
        showToast({
          type: 'error',
          message: error instanceof Error ? error.message : messages.serviceGrid.deleteFailed,
        }),
    })
  }

  async function handleDeleteSelected(slugs: string[]) {
    const navigation = navigationQuery.data
    if (!navigation || !activeSceneId || slugs.length === 0) {
      return
    }

    setContextMenu(null)
    const selected = new Set(slugs)
    const availableSlugs = navigation.bookmarks
      .filter((bookmark) => selected.has(bookmark.slug))
      .map((bookmark) => bookmark.slug)
    if (availableSlugs.length === 0) {
      leaveSelectionMode()
      return
    }

    const confirmed = await confirm({
      title: messages.serviceGrid.confirmDeleteSelectedTitle,
      message: messages.serviceGrid.confirmDeleteSelectedMessage(availableSlugs.length),
      confirmLabel: messages.serviceGrid.deleteSelectedAction,
      cancelLabel: messages.common.cancel,
      variant: 'destructive',
    })

    if (!confirmed) {
      return
    }

    const nextConfig = removeBookmarksFromScene(navigation, activeSceneId, availableSlugs)
    saveMutation.mutate(nextConfig, {
      onSuccess: () => {
        leaveSelectionMode()
        showToast({
          type: 'success',
          message: messages.serviceGrid.selectedDeleted(availableSlugs.length),
        })
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : messages.serviceGrid.deleteFailed
        showToast({ type: 'error', message })
      },
    })
  }

  async function handleBatchAdd(placements: { sceneId: string; groupId: string }[]) {
    const navigation = navigationQuery.data
    const slugs = Array.from(new Set(selectedSlugs))
    if (!navigation || slugs.length === 0 || placements.length === 0) return

    const conflicts = getBookmarkPlacementConflicts(navigation, slugs, placements)
    if (conflicts.length > 0) {
      const details = Array.from(
        new Set(
          conflicts.map((conflict) => {
            const bookmark = navigation.bookmarks.find((item) => item.slug === conflict.bookmarkId)
            const scene = navigation.scenes.find((item) => item.id === conflict.sceneId)
            return `${bookmark?.name ?? conflict.bookmarkId} — ${scene?.name ?? conflict.sceneId} / ${conflict.groupName}`
          })
        )
      ).join('\n')
      const confirmed = await confirm({
        title: messages.serviceGrid.batchAddConfirmTitle,
        message: messages.serviceGrid.batchAddConfirmMessage(details),
        confirmLabel: messages.serviceGrid.batchAddConfirmAction,
        cancelLabel: messages.common.cancel,
      })
      if (!confirmed) return
    }

    try {
      const nextConfig = addBookmarksToSceneGroups(
        navigation,
        slugs,
        placements,
        conflicts.length > 0
      )
      saveMutation.mutate(nextConfig, {
        onSuccess: () => {
          setBatchDialogOpen(false)
          leaveSelectionMode()
          showToast({ type: 'success', message: messages.serviceGrid.batchAdded(slugs.length) })
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : messages.serviceGrid.deleteFailed
          showToast({ type: 'error', message })
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : messages.serviceGrid.deleteFailed
      showToast({ type: 'error', message })
    }
  }

  async function handleDeleteGroup(groupId: string, groupName: string) {
    const navigation = navigationQuery.data
    if (!navigation || !activeSceneId) {
      return
    }

    const scene = findScene(navigation, activeSceneId)
    const group = scene?.groups.find((item) => item.id === groupId)
    if (!group) {
      return
    }

    setContextMenu(null)
    const confirmed = await confirm({
      title: messages.serviceGrid.confirmDeleteGroupTitle,
      message: messages.serviceGrid.confirmDeleteGroupMessage(groupName, group.bookmarkIds.length),
      confirmLabel: messages.serviceGrid.deleteGroupAction,
      cancelLabel: messages.common.cancel,
      variant: 'destructive',
    })

    if (!confirmed) {
      return
    }

    const nextConfig = removeGroupFromScene(navigation, activeSceneId, groupId)
    saveMutation.mutate(nextConfig, {
      onSuccess: () => {
        showToast({ type: 'success', message: messages.serviceGrid.groupDeleted(groupName) })
      },
      onError: (error) => {
        const message =
          error instanceof Error ? error.message : messages.serviceGrid.deleteGroupFailed
        showToast({ type: 'error', message })
      },
    })
  }

  function handleRenameGroup(groupId: string, groupName: string) {
    const navigation = navigationQuery.data
    if (!navigation || !activeSceneId) {
      return
    }

    const name = groupName.trim()
    if (!name) {
      showToast({ type: 'error', message: messages.errors.groupNameRequired })
      return
    }

    const scene = findScene(navigation, activeSceneId)
    if (scene?.groups.some((group) => group.id !== groupId && group.name === name)) {
      showToast({ type: 'error', message: messages.errors.groupExists(name) })
      return
    }

    try {
      const nextConfig = renameGroupInScene(navigation, activeSceneId, groupId, name)
      saveMutation.mutate(nextConfig, {
        onSuccess: () => {
          setRenamingGroup(null)
          showToast({ type: 'success', message: messages.serviceGrid.groupRenamed(name) })
        },
        onError: (error) => {
          const message =
            error instanceof Error ? error.message : messages.serviceGrid.renameGroupFailed
          showToast({ type: 'error', message })
        },
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : messages.serviceGrid.renameGroupFailed
      showToast({ type: 'error', message })
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="rounded-[1.75rem] border border-border/75 bg-card/72 px-8 py-6 text-center shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-card/70 dark:shadow-[0_24px_56px_rgba(0,0,0,0.28)]">
          <p className="text-sm font-medium tracking-wide text-muted-foreground">
            {messages.common.loading}
          </p>
        </div>
      </div>
    )
  }

  if (renderGroups.length === 0) {
    const hasAnyBookmarks = activeConfig.some((group) => group.items.length > 0)

    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="max-w-lg rounded-[1.75rem] border border-dashed border-border/80 bg-card/60 px-6 py-9 text-center shadow-[0_18px_44px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <p className="text-base font-semibold text-foreground">
            {hasAnyBookmarks ? messages.home.noSearchResults : messages.home.emptyTitle}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {hasAnyBookmarks ? messages.common.noServices : messages.home.emptyDescription}
          </p>
        </div>
      </div>
    )
  }

  const menuLeft = contextMenu ? Math.max(8, Math.min(contextMenu.x, window.innerWidth - 208)) : 0
  const menuTop = contextMenu ? Math.max(8, Math.min(contextMenu.y, window.innerHeight - 120)) : 0
  const desktopCardWidth =
    desktopColumnCount > 0 && gridWidth > 0
      ? getDesktopCardWidth(gridWidth, desktopColumnCount)
      : DESKTOP_CARD_MIN_WIDTH_PX
  const compactCardWidth = Math.min(
    Math.max(desktopCardWidth, DESKTOP_COMPACT_CARD_PREFERRED_WIDTH_PX),
    DESKTOP_COMPACT_CARD_MAX_WIDTH_PX
  )

  return (
    <>
      {selectionMode ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex justify-center px-4 [padding-bottom:env(safe-area-inset-bottom)]">
          <div className="pointer-events-auto flex min-h-10 items-center gap-3 rounded-full border border-primary/25 bg-popover/96 px-4 py-1.5 text-sm text-muted-foreground shadow-[0_16px_40px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:shadow-[0_18px_44px_rgba(0,0,0,0.4)]">
            <span>{messages.serviceGrid.selectedCount(selectedSlugs.size)}</span>
            <button
              type="button"
              aria-label={messages.serviceGrid.exitSelection}
              title={messages.serviceGrid.exitSelection}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-accent hover:text-foreground"
              onClick={leaveSelectionMode}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
      <div ref={gridRef} className="flex w-full flex-wrap items-stretch gap-3 md:gap-3.5">
        {renderGroups.map((group) => {
          const isCollapsed = isGroupCollapsedForView(
            activeSceneId,
            group.groupId,
            collapsedGroupKeys,
            isSearchActive
          )
          const isGroupDropTarget =
            Boolean(group.groupId) &&
            dragOver?.groupIndex === group.actualGroupIndex &&
            typeof dragOver.serviceIndex === 'undefined'
          const compactGroupWidth = getCompactGroupWidth(
            isCollapsed ? 0 : group.services.length,
            compactCardWidth
          )
          const canKeepSingleRow =
            isCollapsed ||
            (desktopColumnCount > 0 && group.services.length > 0 && compactGroupWidth <= gridWidth)
          const compactGridStyle = canKeepSingleRow
            ? ({
                '--desktop-card-width': `${compactCardWidth}px`,
              } as CSSProperties)
            : undefined

          return (
            <section
              key={group.isQuickRecordGroup ? '__quick-records__' : group.groupId || group.category}
              className={`harbor-group-section flex w-full flex-col rounded-[1.55rem] border border-border/75 bg-card/62 p-2.5 shadow-[0_16px_34px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl transition duration-300 md:p-3 dark:bg-card/60 dark:shadow-[0_18px_44px_rgba(0,0,0,0.28)] ${canKeepSingleRow ? 'lg:w-fit lg:flex-none' : 'lg:flex-1 lg:basis-full'} ${isGroupDropTarget ? 'border-primary/40 ring-2 ring-primary/10' : ''}`}
            >
              <div className="flex flex-1 flex-col gap-2.5 md:h-full md:flex-row md:items-stretch md:gap-3">
                <div
                  className="relative flex w-full shrink-0 cursor-pointer items-center justify-center rounded-[1.15rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.96),hsl(var(--background)/0.84))] px-4 py-3 text-center shadow-[0_10px_24px_rgba(15,23,42,0.05)] md:min-h-[76px] md:w-[9rem] md:flex-col md:justify-center md:self-stretch"
                  title={
                    isCollapsed
                      ? messages.serviceGrid.expandGroup
                      : messages.serviceGrid.collapseGroup
                  }
                  onClick={() => {
                    if (group.groupId) toggleGroupCollapse(group.groupId)
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    if (selectionMode || !group.groupId) {
                      return
                    }
                    setContextMenu({
                      kind: 'group',
                      groupId: group.groupId,
                      groupName: group.category,
                      x: event.clientX,
                      y: event.clientY,
                    })
                  }}
                >
                  <div className="w-full min-w-0 px-1 md:px-2">
                    <h3
                      className="w-full min-w-0 overflow-hidden break-words text-center text-[14px] font-semibold leading-5 tracking-tight text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] md:text-[15px]"
                      title={group.category}
                    >
                      {group.category}
                    </h3>
                  </div>
                  <button
                    type="button"
                    aria-label={
                      isCollapsed
                        ? messages.serviceGrid.expandGroup
                        : messages.serviceGrid.collapseGroup
                    }
                    title={
                      isCollapsed
                        ? messages.serviceGrid.expandGroup
                        : messages.serviceGrid.collapseGroup
                    }
                    className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-primary/70 transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (group.groupId) toggleGroupCollapse(group.groupId)
                    }}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  <div className="mt-1 max-w-full rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {messages.common.itemCount(group.services.length)}
                  </div>
                </div>

                <div
                  hidden={isCollapsed}
                  aria-hidden={isCollapsed}
                  className={`${isCollapsed ? '!hidden' : ''} harbor-bookmark-grid grid min-h-[84px] w-full flex-1 grid-cols-2 gap-2 rounded-[1.15rem] bg-background/34 p-1 transition sm:grid-cols-3 md:grid-cols-4 md:gap-2.5 md:p-1.5 ${canKeepSingleRow ? 'lg:w-fit lg:flex-none lg:grid-flow-col lg:grid-cols-none lg:auto-cols-[var(--desktop-card-width)]' : 'lg:grid-cols-6 xl:grid-cols-8'} ${isGroupDropTarget ? 'bg-primary/6 ring-1 ring-primary/10' : ''}`}
                  style={{ ...compactGridStyle, display: isCollapsed ? 'none' : undefined }}
                  onDragOver={(event) => {
                    if (!canDrag || draggingSlugs.length === 0) {
                      return
                    }
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    setDragOver({ groupIndex: group.actualGroupIndex })
                  }}
                  onDrop={(event) => {
                    if (!canDrag) {
                      return
                    }
                    event.preventDefault()
                    commitDrop(group.actualGroupIndex)
                  }}
                >
                  {group.services.length > 0 ? (
                    group.services.map((service, index) => {
                      const isCardDropTarget =
                        dragOver?.groupIndex === group.actualGroupIndex &&
                        dragOver?.serviceIndex === index

                      return (
                        <div key={service.slug} className="relative">
                          <ServiceCard
                            ref={(element) => {
                              if (element) {
                                bookmarkRefs.current.set(service.slug, element)
                              } else {
                                bookmarkRefs.current.delete(service.slug)
                              }
                            }}
                            service={service}
                            networkMode={networkMode}
                            clickOpenTarget={activeSystemConfig.clickOpenTarget}
                            middleClickOpenTarget={activeSystemConfig.middleClickOpenTarget}
                            draggable={
                              canDrag && (!selectionMode || selectedSlugs.has(service.slug))
                            }
                            isDragging={draggingSlugs.includes(service.slug)}
                            isDropTarget={isCardDropTarget}
                            className={
                              selectedSlugs.has(service.slug)
                                ? 'border-primary/60 ring-2 ring-primary/20'
                                : focusedBookmarkSlug === service.slug
                                  ? 'border-primary/45 ring-2 ring-primary/25'
                                  : undefined
                            }
                            role="link"
                            aria-label={service.name}
                            tabIndex={focusedBookmarkSlug === service.slug ? 0 : -1}
                            onFocus={() => setFocusedBookmarkSlug(service.slug)}
                            onKeyDown={(event) => {
                              if (selectionMode) {
                                return
                              }
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                event.currentTarget.click()
                                return
                              }
                              if (
                                event.key === 'ArrowLeft' ||
                                event.key === 'ArrowRight' ||
                                event.key === 'ArrowUp' ||
                                event.key === 'ArrowDown'
                              ) {
                                if (
                                  event.altKey ||
                                  event.shiftKey ||
                                  event.ctrlKey ||
                                  event.metaKey
                                ) {
                                  return
                                }
                                event.preventDefault()
                                const navigationTarget = findBookmarkNavigationTarget(
                                  service.slug,
                                  event.key.slice(5).toLowerCase() as BookmarkNavigationDirection,
                                  visibleBookmarkEntries,
                                  bookmarkRefs.current
                                )
                                if (navigationTarget?.type === 'bookmark') {
                                  focusBookmark(navigationTarget.slug)
                                } else if (navigationTarget?.type === 'search') {
                                  focusSearchBox()
                                }
                                return
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault()
                                focusSearchBox()
                              }
                            }}
                            onClick={(event) => {
                              if (justLongPressedRef.current) {
                                event.preventDefault()
                                justLongPressedRef.current = false
                                return
                              }
                              if (selectionMode) {
                                event.preventDefault()
                                toggleBookmarkSelection(service.slug)
                                return
                              }
                              setFocusedBookmarkSlug(service.slug)
                            }}
                            onMouseDown={(event) => beginBookmarkLongPress(service.slug, event)}
                            onMouseMove={trackBookmarkLongPress}
                            onMouseUp={finishBookmarkPress}
                            onMouseLeave={finishBookmarkPress}
                            onDragStart={(event) => {
                              if (!canDrag || (selectionMode && !selectedSlugs.has(service.slug))) {
                                event.preventDefault()
                                return
                              }
                              clearLongPress()
                              const nextDraggingSlugs = selectionMode
                                ? Array.from(selectedSlugs)
                                : [service.slug]
                              event.dataTransfer.effectAllowed = 'move'
                              event.dataTransfer.setData('text/plain', nextDraggingSlugs.join('\n'))
                              setContextMenu(null)
                              setDraggingSlugs(nextDraggingSlugs)
                            }}
                            onDragOver={(event) => {
                              if (!canDrag || draggingSlugs.length === 0) {
                                return
                              }
                              event.preventDefault()
                              event.stopPropagation()
                              event.dataTransfer.dropEffect = 'move'
                              setDragOver({
                                groupIndex: group.actualGroupIndex,
                                serviceIndex: index,
                              })
                            }}
                            onDrop={(event) => {
                              if (!canDrag) {
                                return
                              }
                              event.preventDefault()
                              event.stopPropagation()
                              commitDrop(group.actualGroupIndex, index)
                            }}
                            onDragEnd={clearDragState}
                            onContextMenu={(event) => {
                              event.preventDefault()
                              clearLongPress()
                              if (group.isQuickRecordGroup && activeSceneId) {
                                setContextMenu({
                                  kind: 'quick-record',
                                  recordId: service.slug.replace(/^quick-/, ''),
                                  sceneId: activeSceneId,
                                  x: event.clientX,
                                  y: event.clientY,
                                })
                                return
                              }
                              if (selectionMode) {
                                const slugs = selectedSlugs.has(service.slug)
                                  ? Array.from(selectedSlugs)
                                  : [service.slug]
                                if (!selectedSlugs.has(service.slug)) {
                                  setSelectedSlugs(new Set(slugs))
                                }
                                setContextMenu({
                                  kind: 'selection',
                                  slugs,
                                  x: event.clientX,
                                  y: event.clientY,
                                })
                                return
                              }
                              setContextMenu({
                                kind: 'bookmark',
                                slug: service.slug,
                                x: event.clientX,
                                y: event.clientY,
                              })
                            }}
                          />
                          {selectionMode ? (
                            <button
                              type="button"
                              aria-label={messages.serviceGrid.toggleSelection(service.name)}
                              aria-pressed={selectedSlugs.has(service.slug)}
                              className={`absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition ${selectedSlugs.has(service.slug) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/95 text-transparent hover:border-primary/50'}`}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                toggleBookmarkSelection(service.slug)
                              }}
                              onContextMenu={(event) => event.stopPropagation()}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      )
                    })
                  ) : (
                    <div className="col-span-full flex min-h-[90px] items-center justify-center rounded-[1rem] border border-dashed border-border/70 bg-background/56 px-4 text-sm text-muted-foreground">
                      {messages.serviceGrid.dropHint}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )
        })}
      </div>

      <LazyBookmarkEditDialog
        open={bookmarkDialog !== null}
        config={navigationQuery.data}
        serviceSlug={bookmarkDialog?.slug ?? null}
        mode={bookmarkDialog?.mode}
        initialSceneId={bookmarkDialog?.initialSceneId}
        initialGroupId={bookmarkDialog?.initialGroupId}
        onClose={() => setBookmarkDialog(null)}
      />

      <QuickRecordEditDialog
        open={quickRecordDialog !== null}
        config={navigationQuery.data}
        recordId={quickRecordDialog?.recordId ?? null}
        sceneId={quickRecordDialog?.sceneId ?? null}
        onClose={() => setQuickRecordDialog(null)}
      />

      <BookmarkBatchPlacementDialog
        open={batchDialogOpen}
        navigation={navigationQuery.data}
        selectedSlugs={Array.from(selectedSlugs)}
        activeSceneId={activeSceneId}
        sceneTokens={sceneTokens}
        saving={saveMutation.isPending}
        onClose={() => setBatchDialogOpen(false)}
        onConfirm={(placements) => void handleBatchAdd(placements)}
      />

      <GroupRenameDialog
        open={renamingGroup !== null}
        currentName={renamingGroup?.groupName ?? ''}
        saving={saveMutation.isPending}
        onClose={() => setRenamingGroup(null)}
        onSave={(name) => {
          if (renamingGroup) {
            handleRenameGroup(renamingGroup.groupId, name)
          }
        }}
      />

      {contextMenu &&
        createPortal(
          <div className="fixed inset-0 z-[95]" onClick={() => setContextMenu(null)}>
            <div
              className="absolute w-48 overflow-hidden rounded-[1rem] border border-border/80 bg-popover/96 p-1.5 shadow-[0_24px_56px_rgba(15,23,42,0.2)] backdrop-blur-xl dark:shadow-[0_24px_60px_rgba(0,0,0,0.42)]"
              style={{ left: menuLeft, top: menuTop }}
              onClick={(event) => event.stopPropagation()}
            >
              {contextMenu.kind === 'bookmark' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setBookmarkDialog({ mode: 'edit', slug: contextMenu.slug })
                      setContextMenu(null)
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-accent/80"
                  >
                    <Pencil className="h-4 w-4" />
                    {messages.serviceGrid.editAction}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBookmarkDialog({ mode: 'duplicate', slug: contextMenu.slug })
                      setContextMenu(null)
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-accent/80"
                  >
                    <Copy className="h-4 w-4" />
                    {messages.serviceGrid.duplicateAction}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteBookmark(contextMenu.slug)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    {messages.serviceGrid.deleteAction}
                  </button>
                </>
              ) : null}
              {contextMenu.kind === 'quick-record' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickRecordDialog({
                        recordId: contextMenu.recordId,
                        sceneId: contextMenu.sceneId,
                      })
                      setContextMenu(null)
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-accent/80"
                  >
                    <Pencil className="h-4 w-4" />
                    编辑记录
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteQuickRecord(contextMenu.recordId, contextMenu.sceneId)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    删除记录
                  </button>
                </>
              ) : null}
              {contextMenu.kind === 'group' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setBookmarkDialog({
                        mode: 'create',
                        slug: null,
                        initialSceneId: activeSceneId,
                        initialGroupId: contextMenu.groupId,
                      })
                      setContextMenu(null)
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-accent/80"
                  >
                    <Plus className="h-4 w-4" />
                    {messages.serviceGrid.createBookmarkAction}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingGroup({
                        groupId: contextMenu.groupId,
                        groupName: contextMenu.groupName,
                      })
                      setContextMenu(null)
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-accent/80"
                  >
                    <Pencil className="h-4 w-4" />
                    {messages.serviceGrid.editGroupAction}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleDeleteGroup(contextMenu.groupId, contextMenu.groupName)
                    }
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    {messages.serviceGrid.deleteGroupAction}
                  </button>
                </>
              ) : null}
              {contextMenu.kind === 'selection' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setBatchDialogOpen(true)
                      setContextMenu(null)
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-accent/80"
                  >
                    <Plus className="h-4 w-4" />
                    {messages.serviceGrid.batchAddActionWithCount(contextMenu.slugs.length)}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSelected(contextMenu.slugs)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    {messages.serviceGrid.deleteSelectedActionWithCount(contextMenu.slugs.length)}
                  </button>
                </>
              ) : null}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
