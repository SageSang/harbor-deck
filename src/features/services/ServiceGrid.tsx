import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { useI18n } from '@/i18n/runtime'
import { useAppStore } from '@/store/appStore'
import { useSystemConfig } from '@/features/config/useSystemConfig'
import { defaultSystemConfig } from '@/features/config/api'
import { useFeedback } from '@/features/feedback/useFeedback'
import { LazyBookmarkEditDialog } from '@/features/services/LazyBookmarkEditDialog'
import {
  cloneServicesConfig,
  defaultServicesConfig,
} from '@/features/services/servicesConfig'
import {
  cloneNavigationConfig,
  findScene,
  removeBookmarkFromScene,
} from '@/features/navigation/navigationConfig'
import { useNavigationConfig, useSaveNavigationConfig } from '@/features/navigation/useNavigation'
import { ServiceCard } from './ServiceCard'
import { preloadServiceIcons } from './iconRegistry'
import { useServices } from './useServices'

interface DragOverState {
  groupIndex: number
  serviceIndex?: number
}

interface ContextMenuState {
  slug: string
  x: number
  y: number
}

const DESKTOP_SECTION_HORIZONTAL_PADDING_PX = 24
const DESKTOP_LABEL_WIDTH_PX = 84
const DESKTOP_SECTION_GAP_PX = 12
const DESKTOP_GRID_HORIZONTAL_PADDING_PX = 12
const DESKTOP_CARD_GAP_PX = 10
const DESKTOP_CARD_MIN_WIDTH_PX = 130

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

export function ServiceGrid() {
  const { groupedServices, isLoading, config } = useServices()
  const searchKeyword = useAppStore((state) => state.searchKeyword)
  const networkMode = useAppStore((state) => state.networkMode)
  const { data: systemConfig } = useSystemConfig()
  const navigationQuery = useNavigationConfig()
  const activeSceneId = useAppStore((state) => state.activeSceneId)
  const saveMutation = useSaveNavigationConfig()
  const { showToast, confirm } = useFeedback()
  const { messages } = useI18n()
  const [draggingSlug, setDraggingSlug] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<DragOverState | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
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
  const activeSystemConfig = systemConfig ?? defaultSystemConfig

  const activeConfig = useMemo(() => cloneServicesConfig(config ?? defaultServicesConfig), [config])
  const canDrag = searchKeyword.trim().length === 0 && !saveMutation.isPending

  const displayGroups = useMemo(
    () =>
      groupedServices
        .map((group) => ({
          ...group,
          actualGroupIndex: activeConfig.findIndex((item) => item.category === group.category),
        }))
        .filter((group) => group.actualGroupIndex >= 0),
    [activeConfig, groupedServices]
  )
  const visibleServiceIcons = useMemo(
    () =>
      Array.from(
        new Set(displayGroups.flatMap((group) => group.services.map((service) => service.icon)))
      ),
    [displayGroups]
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
    if (typeof window === 'undefined') {
      return
    }

    const updateDesktopColumnCount = () => {
      setDesktopColumnCount((current) => {
        const next =
          window.innerWidth >= 1280 ? 8 : window.innerWidth >= 1024 ? 6 : 0

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
  }, [displayGroups.length, isLoading])

  function clearDragState() {
    setDraggingSlug(null)
    setDragOver(null)
  }

  function commitDrop(targetGroupIndex: number, targetServiceIndex?: number) {
    if (!draggingSlug) {
      return
    }

    const navigation = navigationQuery.data
    const scene = navigation && activeSceneId ? findScene(navigation, activeSceneId) : undefined
    if (!navigation || !scene) {
      clearDragState()
      return
    }

    const sourceGroupIndex = scene.groups.findIndex((group) => group.bookmarkIds.includes(draggingSlug))
    const sourceGroup = scene.groups[sourceGroupIndex]
    if (!sourceGroup) {
      clearDragState()
      return
    }
    const targetGroup = scene.groups[targetGroupIndex]
    if (!targetGroup) {
      clearDragState()
      return
    }
    const sourceServiceIndex = sourceGroup.bookmarkIds.indexOf(draggingSlug)
    const isSameGroup = sourceGroupIndex === targetGroupIndex
    const isDropToSameSpot =
      isSameGroup &&
      ((typeof targetServiceIndex === 'number' &&
        (targetServiceIndex === sourceServiceIndex ||
          targetServiceIndex === sourceServiceIndex + 1)) ||
        (typeof targetServiceIndex === 'undefined' &&
          sourceServiceIndex === sourceGroup.bookmarkIds.length - 1))

    if (isDropToSameSpot) {
      clearDragState()
      return
    }

    try {
      const nextConfig = cloneNavigationConfig(navigation)
      const nextScene = findScene(nextConfig, activeSceneId!)!
      const nextSourceGroup = nextScene.groups[sourceGroupIndex]
      const nextTargetGroup = nextScene.groups[targetGroupIndex]
      const [bookmarkId] = nextSourceGroup.bookmarkIds.splice(sourceServiceIndex, 1)
      const adjustedIndex =
        typeof targetServiceIndex === 'number' && isSameGroup && sourceServiceIndex < targetServiceIndex
          ? targetServiceIndex - 1
          : targetServiceIndex
      const insertIndex =
        typeof adjustedIndex === 'number'
          ? Math.min(Math.max(adjustedIndex, 0), nextTargetGroup.bookmarkIds.length)
          : nextTargetGroup.bookmarkIds.length
      nextTargetGroup.bookmarkIds.splice(insertIndex, 0, bookmarkId)
      clearDragState()
      saveMutation.mutate(nextConfig)
    } catch {
      clearDragState()
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

  if (groupedServices.length === 0) {
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

  const menuLeft = contextMenu ? Math.min(contextMenu.x, window.innerWidth - 180) : 0
  const menuTop = contextMenu ? Math.min(contextMenu.y, window.innerHeight - 120) : 0
  const desktopCardWidth =
    desktopColumnCount > 0 && gridWidth > 0
      ? getDesktopCardWidth(gridWidth, desktopColumnCount)
      : DESKTOP_CARD_MIN_WIDTH_PX

  return (
    <>
      <div ref={gridRef} className="flex w-full flex-wrap items-start gap-3 md:gap-3.5">
        {displayGroups.map((group, groupIndex) => {
          const isGroupDropTarget =
            dragOver?.groupIndex === group.actualGroupIndex &&
            typeof dragOver.serviceIndex === 'undefined'
          const compactGroupWidth = getCompactGroupWidth(group.services.length, desktopCardWidth)
          const canKeepSingleRow =
            desktopColumnCount > 0 &&
            group.services.length > 0 &&
            compactGroupWidth <= gridWidth
          const compactGridStyle = canKeepSingleRow
            ? ({
                '--desktop-card-width': `${desktopCardWidth}px`,
              } as CSSProperties)
            : undefined

          return (
            <section
              key={group.category}
              className={`w-full rounded-[1.55rem] border border-border/75 bg-card/62 p-2.5 shadow-[0_16px_34px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl transition duration-300 md:p-3 dark:bg-card/60 dark:shadow-[0_18px_44px_rgba(0,0,0,0.28)] ${canKeepSingleRow ? 'lg:w-fit lg:flex-none' : 'lg:flex-1 lg:basis-full'} ${isGroupDropTarget ? 'border-primary/40 ring-2 ring-primary/10' : ''}`}
            >
              <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:gap-3">
                <div className="flex w-full shrink-0 items-center justify-center rounded-[1.15rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.96),hsl(var(--background)/0.84))] px-4 py-3 text-center shadow-[0_10px_24px_rgba(15,23,42,0.05)] md:w-[5.25rem] md:flex-col md:justify-center md:self-stretch">
                  <h3 className="break-words text-[14px] font-semibold leading-5 tracking-tight text-foreground md:text-[15px]">
                    {group.category}
                  </h3>
                  <span className="mt-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {messages.common.itemCount(group.services.length)}
                  </span>
                </div>

                <div
                  className={`grid min-h-[76px] w-full flex-1 grid-cols-2 gap-2 rounded-[1.15rem] bg-background/34 p-1 transition sm:grid-cols-3 md:grid-cols-4 md:gap-2.5 md:p-1.5 ${canKeepSingleRow ? 'lg:w-fit lg:flex-none lg:grid-flow-col lg:grid-cols-none lg:auto-cols-[var(--desktop-card-width)]' : 'lg:grid-cols-6 xl:grid-cols-8'} ${isGroupDropTarget ? 'bg-primary/6 ring-1 ring-primary/10' : ''}`}
                  style={compactGridStyle}
                  onDragOver={(event) => {
                    if (!canDrag || !draggingSlug) {
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
                        <div
                          key={service.slug}
                          className="transform-gpu animate-slide-up motion-reduce:animate-none"
                          style={{ animationDelay: `${(groupIndex * 3 + index) * 45}ms` }}
                        >
                          <ServiceCard
                            service={service}
                            networkMode={networkMode}
                            clickOpenTarget={activeSystemConfig.clickOpenTarget}
                            middleClickOpenTarget={activeSystemConfig.middleClickOpenTarget}
                            draggable={canDrag}
                            isDragging={draggingSlug === service.slug}
                            isDropTarget={isCardDropTarget}
                            onDragStart={(event) => {
                              if (!canDrag) {
                                event.preventDefault()
                                return
                              }
                              event.dataTransfer.effectAllowed = 'move'
                              event.dataTransfer.setData('text/plain', service.slug)
                              setContextMenu(null)
                              setDraggingSlug(service.slug)
                            }}
                            onDragOver={(event) => {
                              if (!canDrag || !draggingSlug) {
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
                              setContextMenu({
                                slug: service.slug,
                                x: event.clientX,
                                y: event.clientY,
                              })
                            }}
                          />
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
        open={editingSlug !== null}
        config={navigationQuery.data}
        serviceSlug={editingSlug}
        onClose={() => setEditingSlug(null)}
      />

      {contextMenu &&
        createPortal(
          <div className="fixed inset-0 z-[95]" onClick={() => setContextMenu(null)}>
            <div
              className="absolute w-48 overflow-hidden rounded-[1rem] border border-border/80 bg-popover/96 p-1.5 shadow-[0_24px_56px_rgba(15,23,42,0.2)] backdrop-blur-xl dark:shadow-[0_24px_60px_rgba(0,0,0,0.42)]"
              style={{ left: menuLeft, top: menuTop }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  setEditingSlug(contextMenu.slug)
                  setContextMenu(null)
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-accent/80"
              >
                <Pencil className="h-4 w-4" />
                {messages.serviceGrid.editAction}
              </button>
              <button
                type="button"
                onClick={() => handleDeleteBookmark(contextMenu.slug)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                {messages.serviceGrid.deleteAction}
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
