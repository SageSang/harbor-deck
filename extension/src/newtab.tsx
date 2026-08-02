import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getMessages } from '@extension/i18n'
import { resolveAvailableTarget } from '@extension/network'
import {
  defaultLanguage,
  readLanguage,
  readResolutionCache,
  readSettings,
  RESOLUTION_CACHE_TTL_MS,
} from '@extension/storage'
import type { ExtensionLanguage, ExtensionSettings, ResolvedTarget } from '@extension/types'
import './styles.css'

const LOADING_UI_DELAY_MS = 240
// A fresh resolution is already trusted, so keep the hand-off almost
// immediate. The short grace period still lets Chrome finish focusing the
// address bar before the navigation page replaces the tab.
const CACHED_REDIRECT_GRACE_MS = 60
const UNCACHED_REDIRECT_GRACE_MS = 700

function withEmbeddedFlag(url: string): string {
  const parsed = new URL(url)
  parsed.searchParams.set('embedded', '1')
  return parsed.toString()
}

function getFreshResolutionTarget(
  cache: Awaited<ReturnType<typeof readResolutionCache>>,
  settings: ExtensionSettings
): ResolvedTarget | null {
  if (
    cache &&
      cache.primaryUrl === settings.primaryUrl &&
      cache.fallbackUrl === settings.fallbackUrl &&
      Date.now() - cache.resolvedAt <= RESOLUTION_CACHE_TTL_MS
  ) {
    return {
      activeUrl: cache.activeUrl,
      reason: cache.reason,
    }
  }

  return null
}

type NewTabState =
  | {
      phase: 'boot'
      language: ExtensionLanguage
      settings: ExtensionSettings | null
      target: null
    }
  | {
      phase: 'ready'
      language: ExtensionLanguage
      settings: ExtensionSettings
      target: ResolvedTarget
      hasFreshCache: boolean
    }

function getStatusText(language: ExtensionLanguage, reason: ResolvedTarget['reason']): string {
  return getMessages(language).newtab.statusByReason[reason]
}

export function App() {
  const [state, setState] = useState<NewTabState>({
    phase: 'boot',
    language: defaultLanguage,
    settings: null,
    target: null,
  })
  const [noticeVisible, setNoticeVisible] = useState(true)
  const [showLoadingUi, setShowLoadingUi] = useState(false)
  const [redirectCancelled, setRedirectCancelled] = useState(false)

  useEffect(() => {
    document.body.dataset.page = 'newtab'

    return () => {
      delete document.body.dataset.page
    }
  }, [])

  useEffect(() => {
    const timerId = window.setTimeout(() => setShowLoadingUi(true), LOADING_UI_DELAY_MS)
    return () => window.clearTimeout(timerId)
  }, [])

  useEffect(() => {
    function cancelRedirect() {
      setRedirectCancelled(true)
    }

    function cancelWhenHidden() {
      if (document.visibilityState === 'hidden') {
        cancelRedirect()
      }
    }

    window.addEventListener('keydown', cancelRedirect, { passive: true })
    window.addEventListener('paste', cancelRedirect, { passive: true })
    window.addEventListener('input', cancelRedirect, { passive: true })
    window.addEventListener('pointerdown', cancelRedirect, { passive: true })
    window.addEventListener('touchstart', cancelRedirect, { passive: true })
    document.addEventListener('visibilitychange', cancelWhenHidden)
    window.addEventListener('pagehide', cancelRedirect, { passive: true })

    return () => {
      window.removeEventListener('keydown', cancelRedirect)
      window.removeEventListener('paste', cancelRedirect)
      window.removeEventListener('input', cancelRedirect)
      window.removeEventListener('pointerdown', cancelRedirect)
      window.removeEventListener('touchstart', cancelRedirect)
      document.removeEventListener('visibilitychange', cancelWhenHidden)
      window.removeEventListener('pagehide', cancelRedirect)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const [settings, language, cache] = await Promise.all([
        readSettings(),
        readLanguage(),
        readResolutionCache(),
      ])
      const cachedTarget = getFreshResolutionTarget(cache, settings)
      const target =
        cachedTarget ??
        (await resolveAvailableTarget(settings.primaryUrl, settings.fallbackUrl, settings.probeTimeoutMs))

      if (!cancelled) {
        setState({
          phase: 'ready',
          language,
          settings,
          target,
          hasFreshCache: cachedTarget !== null,
        })
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (state.phase !== 'ready' || state.settings.openMode !== 'embedded') {
      return
    }

    if (state.target.reason === 'primary' || state.target.reason === 'unconfigured') {
      setNoticeVisible(false)
      return
    }

    setNoticeVisible(true)
    const timerId = window.setTimeout(() => setNoticeVisible(false), 3200)
    return () => window.clearTimeout(timerId)
  }, [state])

  useEffect(() => {
    if (state.phase !== 'ready') {
      return
    }

    if (state.settings.openMode !== 'direct' || !state.target.activeUrl || redirectCancelled) {
      return
    }

    const delay = state.hasFreshCache ? CACHED_REDIRECT_GRACE_MS : UNCACHED_REDIRECT_GRACE_MS
    const timerId = window.setTimeout(() => {
      if (!redirectCancelled) {
        window.location.replace(state.target.activeUrl)
      }
    }, delay)

    return () => window.clearTimeout(timerId)
  }, [redirectCancelled, state])

  if (state.phase === 'boot') {
    const messages = getMessages(state.language)

    if (!showLoadingUi) {
      return <main className="page-shell" />
    }

    return (
      <main className="page-shell">
        <section className="loading-state panel">
          <div className="loading-card panel">
            <div className="eyebrow">HarborDeck</div>
            <h2>{messages.newtab.loadingTitle}</h2>
            <p className="pulse">{messages.newtab.loadingHint}</p>
          </div>
        </section>
      </main>
    )
  }

  const { language, settings, target } = state
  const messages = getMessages(language)

  if (!target.activeUrl) {
    return (
      <main className="page-shell">
        <section className="empty-state panel">
          <div className="empty-card panel">
            <div className="eyebrow">HarborDeck</div>
            <h2>{messages.newtab.unconfiguredTitle}</h2>
            <p>{messages.newtab.unconfiguredDescription}</p>
            <div className="status-actions" style={{ marginTop: 24 }}>
              <button className="btn btn-primary" onClick={() => chrome.runtime.openOptionsPage()}>
                {messages.newtab.openSettingsButton}
              </button>
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (settings.openMode === 'direct') {
    if (redirectCancelled) {
      return (
        <main className="page-shell">
          <section className="empty-state panel">
            <div className="empty-card panel">
              <div className="eyebrow">HarborDeck</div>
              <h2>{messages.newtab.redirectCancelledTitle}</h2>
              <p>{messages.newtab.redirectCancelledDescription}</p>
              <div className="status-actions" style={{ marginTop: 24 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => window.location.replace(target.activeUrl)}
                >
                  {messages.newtab.openNavigationButton}
                </button>
              </div>
            </div>
          </section>
        </main>
      )
    }

    return showLoadingUi ? (
      <main className="page-shell">
        <section className="loading-state panel">
          <div className="loading-card panel">
            <div className="eyebrow">HarborDeck</div>
            <h2>{messages.newtab.loadingTitle}</h2>
            <p className="pulse">{messages.newtab.loadingHint}</p>
          </div>
        </section>
      </main>
    ) : (
      <main className="page-shell" />
    )
  }

  return (
    <main className="embedded-shell">
      <iframe
        title="HarborDeck"
        src={withEmbeddedFlag(target.activeUrl)}
        className="embedded-frame fullbleed"
        referrerPolicy="no-referrer"
      />
      {noticeVisible ? (
        <div className="floating-notice">
          <div className="floating-notice-title">
            {target.reason === 'fallback'
              ? messages.newtab.noticeFallbackTitle
              : messages.newtab.noticeOpeningTitle}
          </div>
          <div className="floating-notice-text">{getStatusText(language, target.reason)}</div>
        </div>
      ) : null}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
