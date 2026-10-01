import { withReadTimeout } from '@shared/readTimeout'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BookmarkCacheView } from '@shared/BookmarkCacheView'
import {
  BOOKMARK_CACHE_KEY,
  CACHE_MESSAGE,
  cacheSource,
  parseBookmarkSnapshot,
} from '@shared/bookmarkSnapshot'
import { readLanguage, defaultLanguage, defaultSettings, STORAGE_KEY } from './storage'
import { readBookmarkCaches, changeBookmarkCache, parseBookmarkCaches } from './bookmarkCache'
import { requestResolution } from './resolutionClient'
import { restoreExtensionTheme } from './theme'
import './cacheBoot'
import './styles.css'

export function App() {
  const boot = useRef(window.__harborDeckCacheBoot).current
  const settings = boot?.settings ?? defaultSettings
  const initialTarget = window.__harborDeckBootSnapshot?.activeUrl ?? ''
  const [language, setLanguage] = useState(defaultLanguage)
  const [snapshot, setSnapshot] = useState(boot?.snapshot ?? null)
  const [query, setQuery] = useState(boot?.query ?? '')
  const [sceneId, setSceneId] = useState<string | null>(null)
  const [target, setTarget] = useState(initialTarget)
  const [frameKey, setFrameKey] = useState(0)
  const [showFrame, setShowFrame] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('')
  const [settingsChanged, setSettingsChanged] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const epoch = useRef('')
  const nonce = useRef('')
  const messageQueue = useRef<Promise<unknown>>(Promise.resolve())
  const generation = useRef(0)
  const interacted = useRef(Boolean(boot?.paused || boot?.query))
  const busyRef = useRef(false)
  const mounted = useRef(true)
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const zh = language !== 'en'
  const targetRef = useRef(target)
  targetRef.current = target
  const frameVisible = useRef(showFrame)
  frameVisible.current = showFrame
  const direct = (url: string) => {
    const next = new URL(url)
    next.searchParams.delete('embedded')
    if (query.trim()) next.searchParams.set('harbordeckQuery', query.trim().slice(0, 2000))
    window.location.replace(next.toString())
  }

  const refresh = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    const own = ++generation.current
    setBusy(true)
    setReady(false)
    setMessage('')
    nonce.current = ''
    try {
      const caches = await readBookmarkCaches(settings)
      if (!mounted.current || own !== generation.current) return
      epoch.current = caches.epoch
      const result = await withReadTimeout(undefined, () =>
        requestResolution(settings, { force: true, verifySingle: true })
      )
      if (!mounted.current || own !== generation.current) return
      if (result.status !== 'success' || !result.activeUrl) throw new Error('unavailable')
      setTarget(result.activeUrl)
      setFrameKey((value) => value + 1)
    } catch {
      if (mounted.current && own === generation.current) {
        setBusy(false)
        setMessage(
          '暂时无法连接，请重试或手动打开。 / Connection unavailable. Retry or open manually.'
        )
      }
    } finally {
      busyRef.current = false
    }
  }, [settings])

  useEffect(() => {
    mounted.current = true
    void readLanguage()
      .then(setLanguage)
      .catch(() => undefined)
    void restoreExtensionTheme().catch(() => undefined)
    document.body.dataset.page = 'newtab'
    void readBookmarkCaches(settings)
      .then((caches) => {
        if (!mounted.current) return
        epoch.current = caches.epoch
        if (!initialTarget) void refresh()
      })
      .catch(() => {
        if (mounted.current) setBusy(false)
      })
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area !== 'local') return
      if (STORAGE_KEY in changes) {
        generation.current += 1
        nonce.current = ''
        setSnapshot(null)
        setTarget('')
        setShowFrame(false)
        setSettingsChanged(true)
        setBusy(false)
        return
      }
      const change = changes[BOOKMARK_CACHE_KEY] as { newValue?: unknown } | undefined
      if (!change) return
      const caches = parseBookmarkCaches(change.newValue, settings)
      if (caches.epoch !== epoch.current) {
        // Retain the old write epoch until an explicit refresh or new login.
        generation.current += 1
        interacted.current = true
      }
      const source = snapshotRef.current?.source || cacheSource(targetRef.current)
      setSnapshot(caches.snapshots.find((entry) => entry.source === source) ?? null)
    }
    const online = () => {
      if (!frameVisible.current) void refresh()
    }
    const pause = () => {
      interacted.current = true
    }
    const visibility = () => {
      if (document.visibilityState === 'hidden') pause()
    }
    chrome.storage.onChanged?.addListener(changed)
    window.addEventListener('online', online)
    window.addEventListener('offline', pause)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      mounted.current = false
      generation.current += 1
      nonce.current = ''
      chrome.storage.onChanged?.removeListener?.(changed)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', pause)
      document.removeEventListener('visibilitychange', visibility)
      delete document.body.dataset.page
    }
  }, [initialTarget, refresh, settings])

  useEffect(() => {
    if (!target || ready) return
    setBusy(true)
    const timer = window.setTimeout(() => {
      setBusy(false)
      interacted.current = true
      setMessage(
        '网页尚未准备好，可继续使用本地书签。 / Page not ready; local bookmarks remain available.'
      )
      // Older servers have no cache bridge. Preserve their normal opening path.
      if (!snapshotRef.current) {
        if (settings.openMode === 'direct') window.location.replace(target)
        else setShowFrame(true)
      }
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [target, frameKey, settings.openMode, ready])

  useEffect(() => {
    if (!target) return
    const handleMessage = async (event: MessageEvent) => {
      const data = event.data
      if (
        event.source === frame.current?.contentWindow &&
        event.origin === new URL(target).origin &&
        data?.type === CACHE_MESSAGE &&
        data.kind === 'ready'
      ) {
        nonce.current = crypto.randomUUID()
        frame.current?.contentWindow?.postMessage(
          { type: CACHE_MESSAGE, kind: 'connect', nonce: nonce.current },
          new URL(target).origin
        )
        return
      }
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== new URL(target).origin ||
        !nonce.current ||
        !data ||
        data.type !== CACHE_MESSAGE ||
        data.nonce !== nonce.current
      )
        return
      const own = generation.current
      const source = cacheSource(target)
      if (data.kind === 'snapshot') {
        const parsed = parseBookmarkSnapshot(data.snapshot, source)
        if (!parsed) return
        try {
          const saved = await changeBookmarkCache(settings, epoch.current, source, parsed)
          if (!mounted.current || own !== generation.current || !saved) return
          setSnapshot(parsed)
          setReady(true)
          setBusy(false)
          setMessage('')
          if (
            !interacted.current &&
            navigator.onLine !== false &&
            document.visibilityState !== 'hidden'
          ) {
            if (settings.openMode === 'direct') direct(target)
            else setShowFrame(true)
          }
        } catch {
          if (own === generation.current) {
            setBusy(false)
            setMessage('本地缓存保存失败。 / Could not save the local copy.')
          }
        }
      } else if (data.kind === 'denied' || data.kind === 'clear') {
        const caches = await readBookmarkCaches(settings)
        if (own !== generation.current || !mounted.current) return
        if (caches.snapshots.some((entry) => entry.source === source) || data.kind === 'clear') {
          const cleared = await changeBookmarkCache(settings, caches.epoch, source, null).catch(
            () => false
          )
          if (!cleared || !mounted.current) return
        }
        setSnapshot(null)
        setBusy(false)
        if (data.kind === 'denied') {
          // A subsequent successful login on this same frame can publish a fresh copy.
          epoch.current = (await readBookmarkCaches(settings)).epoch
          if (settings.openMode === 'direct') direct(target)
          else setShowFrame(true)
        } else {
          generation.current += 1
        }
      }
    }
    const receive = (event: MessageEvent) => {
      messageQueue.current = messageQueue.current
        .catch(() => undefined)
        .then(() => handleMessage(event))
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  })

  const open = () => {
    interacted.current = true
    const url = target || snapshot?.source || settings.primaryUrl || settings.fallbackUrl
    if (!url) {
      void chrome.runtime.openOptionsPage()
      return
    }
    if (settings.openMode === 'direct') direct(url)
    else {
      if (ready && nonce.current && frame.current?.contentWindow) {
        frame.current.contentWindow.postMessage(
          { type: CACHE_MESSAGE, kind: 'open', nonce: nonce.current, query, sceneId },
          new URL(url).origin
        )
      } else {
        const handoff = new URL(url)
        if (query.trim()) handoff.searchParams.set('harbordeckQuery', query.trim().slice(0, 2000))
        setTarget(handoff.toString())
      }
      setShowFrame(true)
    }
  }
  const clear = async () => {
    interacted.current = true
    generation.current += 1
    if (!showFrame) setTarget('')
    const caches = await readBookmarkCaches(settings)
    const source = snapshot?.source || cacheSource(target)
    await changeBookmarkCache(settings, caches.epoch, source, null).catch(() => false)
    setSnapshot(null)
  }
  const frameUrl = target ? new URL(target) : null
  frameUrl?.searchParams.set('embedded', '1')
  return (
    <main className="embedded-shell" style={showFrame ? undefined : { overflowY: 'auto' }}>
      {snapshot && !showFrame && (
        <BookmarkCacheView
          snapshot={snapshot}
          language={language}
          busy={busy}
          query={query}
          onQueryChange={setQuery}
          sceneId={sceneId}
          onSceneChange={setSceneId}
          onInteract={() => {
            interacted.current = true
          }}
          onRefresh={() => void refresh()}
          onClear={() => void clear()}
        >
          <button type="button" onClick={open}>
            {ready
              ? zh
                ? '进入完整页面'
                : 'Open full page'
              : zh
                ? '手动打开网页'
                : 'Open page manually'}
          </button>
        </BookmarkCacheView>
      )}
      {!showFrame && !snapshot && (
        <section className="bookmark-cache">
          <strong>HARBORDECK</strong>
          <p role="status">
            {settingsChanged
              ? zh
                ? '设置已更新，请重新打开此页。'
                : 'Settings changed. Reopen this page.'
              : busy
                ? zh
                  ? '正在打开导航页…'
                  : 'Opening HarborDeck…'
                : message ||
                  (zh
                    ? '暂无本地书签，请先在线打开一次。'
                    : 'No local copy. Open online once first.')}
          </p>
          <button type="button" onClick={open}>
            {zh ? '打开导航页' : 'Open HarborDeck'}
          </button>
          <button
            type="button"
            onClick={() => (settingsChanged ? location.reload() : void refresh())}
          >
            {zh ? '重新检测并打开' : 'Check again and open'}
          </button>
          <button type="button" onClick={() => void chrome.runtime.openOptionsPage()}>
            {zh ? '设置' : 'Settings'}
          </button>
        </section>
      )}
      {!showFrame && snapshot && message && (
        <p role="status" style={{ textAlign: 'center' }}>
          {message}
        </p>
      )}
      {frameUrl && (
        <iframe
          key={frameKey}
          ref={frame}
          title="HarborDeck"
          src={frameUrl.toString()}
          className="embedded-frame fullbleed"
          style={
            showFrame
              ? undefined
              : { position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }
          }
          tabIndex={showFrame ? undefined : -1}
          aria-hidden={!showFrame}
          referrerPolicy="no-referrer"
          onLoad={async () => {
            const own = generation.current
            const caches = await readBookmarkCaches(settings).catch(() => null)
            if (
              !caches ||
              caches.epoch !== epoch.current ||
              own !== generation.current ||
              !mounted.current
            )
              return
            nonce.current = crypto.randomUUID()
            frame.current?.contentWindow?.postMessage(
              { type: CACHE_MESSAGE, kind: 'connect', nonce: nonce.current },
              frameUrl.origin
            )
          }}
        />
      )}
      {showFrame && (
        <div className="floating-notice embedded-help">
          <details>
            <summary>{zh ? '导航帮助' : 'Navigation help'}</summary>
            <div className="status-actions">
              <button
                className="btn"
                onClick={() => {
                  setShowFrame(false)
                  void refresh()
                }}
              >
                {zh ? '重新加载' : 'Reload'}
              </button>
              <a className="btn" href={target} target="_top" rel="noreferrer">
                {zh ? '直接打开' : 'Open directly'}
              </a>
              {snapshot && (
                <button
                  className="btn"
                  onClick={() => {
                    interacted.current = true
                    setShowFrame(false)
                  }}
                >
                  {zh ? '本地书签' : 'Local bookmarks'}
                </button>
              )}
              <button className="btn" onClick={() => void clear()}>
                {zh ? '清除书签缓存' : 'Clear bookmark cache'}
              </button>
              <button className="btn" onClick={() => void chrome.runtime.openOptionsPage()}>
                {zh ? '设置' : 'Settings'}
              </button>
            </div>
          </details>
        </div>
      )}
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
