import { useDialogFocus } from './useDialogFocus'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n/runtime'
import { ServiceIcon } from '@/features/services/ServiceIcon'
import {
  serviceIconCategoryOrder,
  searchServiceIconOptions,
  serviceIconOptions,
  resolveDynamicIconName,
  type ServiceIconOption,
} from '@/features/services/icons'
import { cn } from '@/lib/utils'

interface IconPickerProps {
  value?: string
  size?: 'default' | 'sm'
  onChange: (value?: string) => void
}

const BROWSE_PAGE_SIZE = 96
const SEARCH_PAGE_SIZE = 120
const browseCategoryOrder = ['all', ...serviceIconCategoryOrder] as const
type BrowseCategoryKey = (typeof browseCategoryOrder)[number]

function getInitialBrowseVisibleCount(options: ServiceIconOption[], selectedValue?: string | null) {
  if (!selectedValue) {
    return Math.min(BROWSE_PAGE_SIZE, options.length)
  }

  const selectedIndex = options.findIndex((option) => option.loaderKey === selectedValue)
  if (selectedIndex < 0) {
    return Math.min(BROWSE_PAGE_SIZE, options.length)
  }

  return Math.min(
    options.length,
    Math.max(BROWSE_PAGE_SIZE, Math.ceil((selectedIndex + 1) / BROWSE_PAGE_SIZE) * BROWSE_PAGE_SIZE)
  )
}

export function IconPicker({ value, size = 'default', onChange }: IconPickerProps) {
  const { messages } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [activeCategory, setActiveCategory] = useState<BrowseCategoryKey>('all')
  const [browseVisibleCount, setBrowseVisibleCount] = useState(BROWSE_PAGE_SIZE)
  const [searchVisibleCount, setSearchVisibleCount] = useState(SEARCH_PAGE_SIZE)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<{
    top: number
    left: number
    width: number
  } | null>(null)
  const dropdownRef = useDialogFocus(isOpen && dropdownStyle !== null, () => setIsOpen(false), 140)

  const isCompact = size === 'sm'
  const normalizedValue = resolveDynamicIconName(value)
  const normalizedKeyword = keyword.trim().toLowerCase()
  const isSearching = normalizedKeyword.length > 0

  const categoryLabels: Record<BrowseCategoryKey, string> = {
    all: messages.iconPicker.categories.all,
    system: messages.iconPicker.categories.system,
    files: messages.iconPicker.categories.files,
    media: messages.iconPicker.categories.media,
    development: messages.iconPicker.categories.development,
    network: messages.iconPicker.categories.network,
    security: messages.iconPicker.categories.security,
    communication: messages.iconPicker.categories.communication,
  }

  const categoryCounts = useMemo(
    () =>
      Object.fromEntries(
        browseCategoryOrder.map((categoryKey) => [
          categoryKey,
          categoryKey === 'all'
            ? serviceIconOptions.length
            : serviceIconOptions.filter((option) => option.categories.includes(categoryKey)).length,
        ])
      ) as Record<BrowseCategoryKey, number>,
    []
  )

  const browseOptions = useMemo(() => {
    if (activeCategory === 'all') {
      return serviceIconOptions
    }

    return serviceIconOptions.filter((option) => option.categories.includes(activeCategory))
  }, [activeCategory])

  const filteredOptions = useMemo(
    () => (isSearching ? searchServiceIconOptions(normalizedKeyword) : browseOptions),
    [browseOptions, isSearching, normalizedKeyword]
  )

  const visibleOptions = useMemo(
    () =>
      filteredOptions.slice(
        0,
        isSearching ? Math.min(searchVisibleCount, filteredOptions.length) : browseVisibleCount
      ),
    [browseVisibleCount, filteredOptions, isSearching, searchVisibleCount]
  )

  const hiddenCount = filteredOptions.length - visibleOptions.length

  useEffect(() => {
    if (!isOpen) {
      setKeyword('')
      setDropdownStyle(null)
      return
    }

    const selectedOption = normalizedValue
      ? serviceIconOptions.find((option) => option.loaderKey === normalizedValue)
      : undefined
    const nextCategory = selectedOption?.categories[0] ?? 'all'
    const nextBrowseOptions =
      nextCategory === 'all'
        ? serviceIconOptions
        : serviceIconOptions.filter((option) => option.categories.includes(nextCategory))

    setActiveCategory(nextCategory)
    setBrowseVisibleCount(getInitialBrowseVisibleCount(nextBrowseOptions, normalizedValue))
    setSearchVisibleCount(SEARCH_PAGE_SIZE)
    searchRef.current?.focus()

    const updateDropdownPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) {
        return
      }

      const width = Math.min(rect.width, window.innerWidth - 16)
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)

      setDropdownStyle({
        top: rect.bottom + 8,
        left,
        width,
      })
    }

    updateDropdownPosition()

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node

      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return
      }

      setIsOpen(false)
    }

    const handleViewportChange = () => {
      updateDropdownPosition()
    }

    document.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('resize', handleViewportChange)
    document.addEventListener('mousedown', handlePointerDown)

    return () => {
      document.removeEventListener('scroll', handleViewportChange, true)
      window.removeEventListener('resize', handleViewportChange)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isOpen, normalizedValue, dropdownRef])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      searchRef.current?.focus()
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [isOpen])

  useEffect(() => {
    if (!isSearching) {
      return
    }

    setSearchVisibleCount(SEARCH_PAGE_SIZE)
  }, [isSearching, normalizedKeyword])

  function handleCategoryChange(categoryKey: BrowseCategoryKey) {
    const nextBrowseOptions =
      categoryKey === 'all'
        ? serviceIconOptions
        : serviceIconOptions.filter((option) => option.categories.includes(categoryKey))

    setActiveCategory(categoryKey)
    setKeyword('')
    setBrowseVisibleCount(
      getInitialBrowseVisibleCount(
        nextBrowseOptions,
        normalizedValue && nextBrowseOptions.some((option) => option.loaderKey === normalizedValue)
          ? normalizedValue
          : null
      )
    )
  }

  function handleLoadMore() {
    if (isSearching) {
      setSearchVisibleCount((current) =>
        Math.min(filteredOptions.length, current + SEARCH_PAGE_SIZE)
      )
      return
    }

    setBrowseVisibleCount((current) => Math.min(filteredOptions.length, current + BROWSE_PAGE_SIZE))
  }

  const dropdown =
    isOpen && dropdownStyle
      ? createPortal(
          <div
            ref={dropdownRef}
            role="dialog"
            aria-modal="true"
            aria-label={messages.iconPicker.searchPlaceholder}
            tabIndex={-1}
            className="config-panel-card z-[130] overflow-hidden shadow-[0_22px_50px_rgba(109,74,49,0.16)]"
            style={{
              position: 'fixed',
              top: dropdownStyle.top,
              left: dropdownStyle.left,
              width: dropdownStyle.width,
            }}
          >
            <div className="border-b border-border/70 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder={messages.iconPicker.searchPlaceholder}
                  className="h-9 pl-9 pr-9"
                />
                {keyword && (
                  <button
                    type="button"
                    onClick={() => setKeyword('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-muted-foreground">
                  <span>
                    {isSearching
                      ? messages.iconPicker.searchResults(filteredOptions.length)
                      : messages.iconPicker.searchHint}
                  </span>
                  <span>
                    {messages.iconPicker.visibleSummary(
                      visibleOptions.length,
                      filteredOptions.length
                    )}
                  </span>
                </div>

                {!isSearching ? (
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-2">
                    <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-medium text-muted-foreground">
                      <span>{messages.iconPicker.browseByCategory}</span>
                      <span>{categoryLabels[activeCategory]}</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {browseCategoryOrder.map((categoryKey) => {
                        const count = categoryCounts[categoryKey]
                        const isActive = activeCategory === categoryKey
                        const isDisabled = categoryKey !== 'all' && count === 0

                        return (
                          <button
                            key={categoryKey}
                            type="button"
                            onClick={() => handleCategoryChange(categoryKey)}
                            aria-pressed={isActive}
                            disabled={isDisabled}
                            className={cn(
                              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition',
                              isActive
                                ? 'border-primary/30 bg-primary/10 text-primary shadow-sm'
                                : 'border-border/70 bg-background/80 text-foreground hover:border-primary/20 hover:bg-accent',
                              isDisabled &&
                                'cursor-not-allowed opacity-45 hover:border-border/70 hover:bg-background/80'
                            )}
                          >
                            <span>{categoryLabels[categoryKey]}</span>
                            <span className="text-[11px] text-muted-foreground">{count}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="config-scroll max-h-72 overflow-y-auto p-2">
              <button
                type="button"
                onClick={() => {
                  onChange(undefined)
                  setIsOpen(false)
                }}
                className="flex w-full items-center justify-between rounded-lg border border-dashed border-border/80 px-3 py-2 text-sm transition hover:border-primary/30 hover:bg-accent"
              >
                <span className="text-muted-foreground">{messages.iconPicker.noIcon}</span>
                {!value && <Check className="h-4 w-4 text-primary" />}
              </button>

              {visibleOptions.length > 0 ? (
                <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {visibleOptions.map((option) => {
                    const isSelected = option.loaderKey === normalizedValue

                    return (
                      <button
                        key={option.loaderKey}
                        type="button"
                        onClick={() => {
                          onChange(option.label)
                          setIsOpen(false)
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-sm transition hover:border-primary/20 hover:bg-accent',
                          isSelected && 'border-primary/20 bg-accent'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2 text-left">
                          <span className="rounded-md border border-border/70 bg-background/70 p-1.5 text-primary/90">
                            <ServiceIcon name={option.label} className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate">{option.label}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {option.loaderKey}
                            </span>
                          </span>
                        </span>
                        {isSelected && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {messages.iconPicker.noMatches}
                </div>
              )}

              {hiddenCount > 0 ? (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  className="mt-2 flex w-full items-center justify-center rounded-lg border border-border/80 px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary/20 hover:bg-accent"
                >
                  {messages.iconPicker.showMore(
                    Math.min(hiddenCount, isSearching ? SEARCH_PAGE_SIZE : BROWSE_PAGE_SIZE)
                  )}
                </button>
              ) : null}
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          'config-panel-card-muted flex w-full items-center justify-between px-3 text-left transition hover:border-primary/30',
          isCompact ? 'h-10 text-sm' : 'h-11 text-sm'
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'rounded-md border border-border/70 bg-muted/35 text-primary/90',
              isCompact ? 'p-1.5' : 'p-1.5'
            )}
          >
            <ServiceIcon name={value} className="h-4 w-4" />
          </span>
          <span className="truncate text-foreground">
            {value || messages.iconPicker.selectIcon}
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition', isOpen && 'rotate-180')}
        />
      </button>

      {dropdown}
    </div>
  )
}
