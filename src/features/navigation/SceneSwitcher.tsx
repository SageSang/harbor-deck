import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layers3, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ModalShell'
import { focusSearchInputSoon } from '@/components/searchFocus'
import { ApiError } from '@/features/config/api'
import { useActiveScene, useLockScene, useUnlockScene } from '@/features/navigation/useNavigation'
import { useI18n } from '@/i18n/runtime'
import { useAppStore } from '@/store/appStore'

export function SceneSwitcher() {
  const { messages } = useI18n()
  const { sceneListQuery, activeSceneId, activeScene } = useActiveScene()
  const setActiveScene = useAppStore((state) => state.setActiveScene)
  const clearSceneToken = useAppStore((state) => state.clearSceneToken)
  const lastRegularSceneId = useAppStore((state) => state.lastRegularSceneId)
  const sceneTokens = useAppStore((state) => state.sceneTokens)
  const unlockMutation = useUnlockScene()
  const lockMutation = useLockScene()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pendingSceneId, setPendingSceneId] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const scenes = useMemo(() => sceneListQuery.data?.scenes ?? [], [sceneListQuery.data?.scenes])
  const filteredScenes = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return keyword ? scenes.filter((scene) => scene.name.toLowerCase().includes(keyword)) : scenes
  }, [query, scenes])
  const pendingScene = scenes.find((scene) => scene.id === pendingSceneId)

  const chooseScene = useCallback(
    (sceneId: string) => {
      const scene = scenes.find((item) => item.id === sceneId)
      if (!scene) {
        return
      }
      const token = sceneTokens[scene.id]
      if (scene.protected && !token) {
        setPendingSceneId(scene.id)
        setPassword('')
        setFeedback(null)
        setOpen(false)
        return
      }
      setActiveScene(scene.id, { protected: scene.protected, token })
      focusSearchInputSoon()
      setOpen(false)
      setQuery('')
    },
    [scenes, sceneTokens, setActiveScene]
  )

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if (
        !event.altKey ||
        !event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        pendingSceneId ||
        scenes.length < 1
      ) {
        return
      }

      let nextSceneId: string | null = null
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (scenes.length < 2) {
          return
        }
        const currentIndex = Math.max(
          0,
          scenes.findIndex((scene) => scene.id === activeSceneId)
        )
        const offset = event.key === 'ArrowLeft' ? -1 : 1
        nextSceneId = scenes[(currentIndex + offset + scenes.length) % scenes.length]?.id ?? null
      } else {
        const digitMatch = event.code.match(/^(?:Digit|Numpad)([1-9])$/)
        const sceneIndex = digitMatch ? Number(digitMatch[1]) - 1 : -1
        nextSceneId = sceneIndex >= 0 ? (scenes[sceneIndex]?.id ?? null) : null
      }

      if (!nextSceneId || nextSceneId === activeSceneId) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      chooseScene(nextSceneId)
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [activeSceneId, chooseScene, pendingSceneId, scenes])

  function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pendingScene || !password) {
      return
    }
    setFeedback(null)
    unlockMutation.mutate(
      { sceneId: pendingScene.id, password },
      {
        onSuccess: (result) => {
          setActiveScene(pendingScene.id, {
            protected: true,
            token: result.token ?? undefined,
          })
          focusSearchInputSoon()
          setPendingSceneId(null)
          setPassword('')
        },
        onError: (error) => {
          setFeedback(
            error instanceof ApiError && error.status === 429
              ? messages.topBar.scene.tooManyAttempts
              : messages.topBar.scene.invalidPassword
          )
        },
      }
    )
  }

  function endProtectedScene() {
    if (!activeSceneId || !activeScene?.protected) {
      return
    }
    const token = sceneTokens[activeSceneId]
    lockMutation.mutate({ sceneId: activeSceneId, token })
    clearSceneToken(activeSceneId)
    const fallback =
      scenes.find((scene) => scene.id === lastRegularSceneId && !scene.protected) ??
      scenes.find(
        (scene) => scene.id === sceneListQuery.data?.defaultSceneId && !scene.protected
      ) ??
      scenes.find((scene) => !scene.protected)
    if (fallback) {
      setActiveScene(fallback.id, { protected: false })
      focusSearchInputSoon()
    }
    setOpen(false)
  }

  return (
    <>
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          aria-label={messages.topBar.scene.buttonAria}
          title={messages.topBar.scene.buttonAria}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-9 max-w-[10rem] items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2.5 text-xs font-medium text-muted-foreground transition hover:border-primary/25 hover:bg-accent/60 hover:text-foreground"
        >
          <Layers3 className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden truncate sm:inline">{activeScene?.name ?? '...'}</span>
        </button>

        {open ? (
          <>
            <button
              type="button"
              aria-label={messages.common.close}
              className="fixed inset-0 z-[89] cursor-default"
              onClick={() => setOpen(false)}
            />
            <div className="isolate fixed left-3 right-3 top-[4.5rem] z-[90] overflow-hidden rounded-[1rem] border border-border/80 bg-popover p-2 shadow-[0_24px_56px_rgba(15,23,42,0.2)] sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-72">
              <div className="px-2 pb-2 pt-1 text-xs font-semibold text-foreground">
                {messages.topBar.scene.title}
              </div>
              {scenes.length > 6 ? (
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={messages.topBar.scene.searchPlaceholder}
                    className="h-9 pl-9"
                  />
                </div>
              ) : null}
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {filteredScenes.map((scene) => (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => chooseScene(scene.id)}
                    className={`flex min-h-10 w-full items-center rounded-xl px-3 text-left text-sm transition ${scene.id === activeSceneId ? 'bg-primary/10 font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'}`}
                  >
                    <span className="truncate">{scene.name}</span>
                  </button>
                ))}
                {filteredScenes.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {messages.topBar.scene.noResults}
                  </div>
                ) : null}
              </div>
              {activeScene?.protected ? (
                <button
                  type="button"
                  onClick={endProtectedScene}
                  className="mt-2 w-full border-t border-border/70 px-3 pt-3 text-left text-xs text-muted-foreground transition hover:text-foreground"
                >
                  {messages.topBar.scene.endProtectedScene}
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <ModalShell
        open={Boolean(pendingScene)}
        onClose={() => setPendingSceneId(null)}
        title={messages.topBar.scene.passwordTitle}
        description={messages.topBar.scene.passwordDescription(pendingScene?.name ?? '')}
        icon={Layers3}
        widthClassName="max-w-sm"
      >
        <form className="space-y-4 p-5" onSubmit={submitPassword}>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={messages.topBar.scene.passwordPlaceholder}
            autoFocus
          />
          {feedback ? <p className="text-sm text-red-500">{feedback}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPendingSceneId(null)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" disabled={!password || unlockMutation.isPending}>
              {unlockMutation.isPending
                ? messages.topBar.scene.unlockPending
                : messages.topBar.scene.unlockAction}
            </Button>
          </div>
        </form>
      </ModalShell>
    </>
  )
}
