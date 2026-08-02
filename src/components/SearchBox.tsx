import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, CornerDownLeft, Search } from 'lucide-react'
import { buildSearchUrl, getDefaultSearchEngine, getSearchEngines } from '@/config/searchEngines'
import { defaultSystemConfig } from '@/features/config/api'
import { useSaveSystemConfig } from '@/features/config/useSaveSystemConfig'
import { useSystemConfig } from '@/features/config/useSystemConfig'
import { useFeedback } from '@/features/feedback/useFeedback'
import { Input } from '@/components/ui/input'
import { getLocalizedSearchEngineName } from '@/i18n/messages'
import { useI18n } from '@/i18n/runtime'
import { useAppStore } from '@/store/appStore'
import { resolveDirectUrl } from '@/core/navigation/resolveDirectUrl'

export function SearchBox() {
  const { data: systemConfig } = useSystemConfig()
  const saveSystemMutation = useSaveSystemConfig()
  const searchKeyword = useAppStore((state) => state.searchKeyword)
  const setSearchKeyword = useAppStore((state) => state.setSearchKeyword)
  const { language, messages } = useI18n()
  const { showToast } = useFeedback()
  const engineTriggerRef = useRef<HTMLButtonElement | null>(null)
  const engineMenuRef = useRef<HTMLDivElement | null>(null)
  const [isEngineMenuOpen, setIsEngineMenuOpen] = useState(false)
  const [engineTriggerWidth, setEngineTriggerWidth] = useState(72)
  const [engineMenuPosition, setEngineMenuPosition] = useState<{
    left: number
    top: number
    width: number
  } | null>(null)

  const trimmedKeyword = searchKeyword.trim()
  const activeSystemConfig = systemConfig ?? defaultSystemConfig
  const availableSearchEngines = getSearchEngines(activeSystemConfig.customSearchEngines)
  const defaultSearchEngine = getDefaultSearchEngine(
    activeSystemConfig.defaultSearchEngine,
    activeSystemConfig.customSearchEngines
  )
  const [selectedEngineId, setSelectedEngineId] = useState(defaultSearchEngine.id)
  const selectedSearchEngine =
    availableSearchEngines.find((engine) => engine.id === selectedEngineId) ?? defaultSearchEngine
  const selectedSearchEngineName = getLocalizedSearchEngineName(language, selectedSearchEngine)
  const isEmbedded =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('embedded') === '1'

  useEffect(() => {
    setSelectedEngineId(defaultSearchEngine.id)
  }, [defaultSearchEngine.id])

  useEffect(() => {
    const trigger = engineTriggerRef.current
    if (!trigger) {
      return
    }

    const updateTriggerWidth = () => {
      const nextWidth = Math.ceil(trigger.getBoundingClientRect().width)
      setEngineTriggerWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth))
    }

    updateTriggerWidth()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      updateTriggerWidth()
    })

    observer.observe(trigger)

    return () => observer.disconnect()
  }, [selectedSearchEngineName])

  useEffect(() => {
    if (!isEngineMenuOpen) {
      setEngineMenuPosition(null)
      return
    }

    function updateEngineMenuPosition() {
      const trigger = engineTriggerRef.current
      if (!trigger) {
        return
      }

      const rect = trigger.getBoundingClientRect()
      const width = Math.max(Math.ceil(rect.width), 184)
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))

      setEngineMenuPosition({
        left,
        top: rect.bottom + 8,
        width,
      })
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node) {
        if (engineTriggerRef.current?.contains(event.target)) {
          return
        }

        if (engineMenuRef.current?.contains(event.target)) {
          return
        }
      }

      setIsEngineMenuOpen(false)
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsEngineMenuOpen(false)
      }
    }

    updateEngineMenuPosition()
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updateEngineMenuPosition)
    window.addEventListener('scroll', updateEngineMenuPosition, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updateEngineMenuPosition)
      window.removeEventListener('scroll', updateEngineMenuPosition, true)
    }
  }, [isEngineMenuOpen])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || trimmedKeyword.length === 0) {
      return
    }

    event.preventDefault()

    window.location.assign(
      resolveDirectUrl(trimmedKeyword) ?? buildSearchUrl(selectedSearchEngine, trimmedKeyword)
    )
  }

  function handleSearchEngineSelect(nextEngineId: string) {
    if (nextEngineId === selectedEngineId) {
      setIsEngineMenuOpen(false)
      return
    }

    const previousEngineId = selectedEngineId
    setSelectedEngineId(nextEngineId)
    setIsEngineMenuOpen(false)

    saveSystemMutation.mutate(
      {
        ...activeSystemConfig,
        defaultSearchEngine: nextEngineId,
      },
      {
        onError: (error) => {
          setSelectedEngineId(previousEngineId)
          const message =
            error instanceof Error ? error.message : messages.settings.searchSection.saveFailed
          showToast({ type: 'error', message })
        },
      }
    )
  }

  const inputPaddingLeft = Math.max(112, 36 + engineTriggerWidth + 12)

  return (
    <div className="group relative mx-auto w-full max-w-[46rem]">
      <div className="relative rounded-[1.2rem] border border-border/75 bg-background/92 p-1.25 shadow-[0_12px_24px_rgba(15,23,42,0.06)] transition-all duration-200 group-focus-within:border-primary/40 group-focus-within:shadow-[0_0_0_5px_hsl(var(--ring)/0.14),0_18px_40px_rgba(15,23,42,0.1)] dark:bg-background/72 dark:shadow-[0_18px_32px_rgba(0,0,0,0.24)] dark:group-focus-within:shadow-[0_0_0_5px_hsl(var(--ring)/0.2),0_22px_42px_rgba(0,0,0,0.3)]">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70 transition-colors duration-200 group-focus-within:text-primary" />
        <div className="absolute left-9 top-1/2 z-20 -translate-y-1/2">
          <button
            ref={engineTriggerRef}
            type="button"
            title={selectedSearchEngineName}
            aria-haspopup="menu"
            aria-expanded={isEngineMenuOpen}
            aria-label={messages.common.searchEngineSwitcherAria}
            disabled={saveSystemMutation.isPending}
            onClick={() => setIsEngineMenuOpen((open) => !open)}
            className="inline-flex h-6 min-w-[3.9rem] max-w-[8.75rem] items-center gap-1 rounded-full border border-border/70 bg-background/92 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-[10.5rem]"
          >
            <span className="min-w-0 flex-1 truncate text-center">{selectedSearchEngineName}</span>
            <ChevronDown
              className={`h-3 w-3 shrink-0 text-muted-foreground/75 transition-transform duration-200 ${isEngineMenuOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
        <Input
          autoFocus={!isEmbedded}
          type="text"
          enterKeyHint="search"
          placeholder={messages.common.searchPlaceholder}
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-9 rounded-[0.95rem] border-transparent bg-transparent pl-[7rem] pr-10 text-[13px] shadow-none placeholder:text-muted-foreground/68 focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0 sm:h-[2.625rem] sm:pl-[7.6rem] sm:text-[13.5px]"
          style={{ paddingLeft: `${inputPaddingLeft}px` }}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full border border-border/70 bg-background/92 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
          <CornerDownLeft className="h-3 w-3" />
          <span className="hidden sm:inline">Enter</span>
        </span>
      </div>
      {isEngineMenuOpen && engineMenuPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={engineMenuRef}
              role="menu"
              aria-label={messages.common.searchEngineSwitcherAria}
              className="fixed z-[140] overflow-hidden rounded-[1rem] border border-border/80 bg-popover/96 p-1.5 shadow-[0_24px_56px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:shadow-[0_24px_60px_rgba(0,0,0,0.42)]"
              style={{
                left: engineMenuPosition.left,
                top: engineMenuPosition.top,
                width: engineMenuPosition.width,
              }}
            >
              {availableSearchEngines.map((engine) => {
                const engineName = getLocalizedSearchEngineName(language, engine)
                const isActive = engine.id === selectedSearchEngine.id

                return (
                  <button
                    key={engine.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => handleSearchEngineSelect(engine.id)}
                    className={`flex w-full items-center gap-2 rounded-[0.8rem] px-2.5 py-2 text-left text-xs transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-foreground'
                        : 'text-muted-foreground hover:bg-accent/55 hover:text-foreground'
                    }`}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {isActive ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                    </span>
                    <span className="truncate">{engineName}</span>
                  </button>
                )
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
