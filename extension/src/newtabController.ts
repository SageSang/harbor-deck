import {
  CACHED_REDIRECT_GRACE_MS,
  UNCACHED_REDIRECT_GRACE_MS,
  emptyResolution,
  isFreshResolution,
  matchesSettings,
} from './resolutionState'
import type { ExtensionSettings, NewTabBootSnapshot } from './types'

export type PauseReason = 'input' | 'hidden' | 'offline' | 'deadline' | 'failed' | 'unconfigured'

/** One new tab owns one automatic navigation. Once paused, no async result rearms it. */
export function createNewTabController(options: {
  settings: ExtensionSettings
  initial: NewTabBootSnapshot | null
  navigate(snapshot: NewTabBootSnapshot): void
  changed(snapshot: NewTabBootSnapshot | null, paused: PauseReason | null): void
  now?: () => number
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
}) {
  const now = options.now ?? Date.now
  const setTimer = options.setTimer ?? setTimeout
  const clearTimer = options.clearTimer ?? clearTimeout
  const start = now()
  const warm = isFreshResolution(options.initial, options.settings, start)
  let snapshot = matchesSettings(options.initial, options.settings) ? options.initial : null
  let paused: PauseReason | null = null
  let navigated = false
  let openTimer: ReturnType<typeof setTimeout> | undefined
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined

  const clear = () => {
    if (openTimer !== undefined) clearTimer(openTimer)
    if (deadlineTimer !== undefined) clearTimer(deadlineTimer)
    openTimer = deadlineTimer = undefined
  }
  const pause = (reason: PauseReason) => {
    if (navigated) return
    paused ??= reason
    clear()
    options.changed(snapshot, paused)
  }
  const schedule = (earliest: number) => {
    if (paused || navigated || !snapshot?.activeUrl) return
    if (openTimer !== undefined) clearTimer(openTimer)
    openTimer = setTimer(
      () => {
        if (paused || navigated || !snapshot?.activeUrl) return
        navigated = true
        clear()
        options.navigate(snapshot)
      },
      Math.max(0, earliest - (now() - start))
    )
  }
  const accept = (next: NewTabBootSnapshot) => {
    if (!matchesSettings(next, options.settings) || navigated) return
    if (snapshot && next.lastAttemptAt < snapshot.lastAttemptAt) return
    snapshot = next
    options.changed(snapshot, paused)
    if (paused) return
    if (next.status === 'failed' || next.failedUrls.includes(next.activeUrl)) {
      pause('failed')
      return
    }
    if (next.status === 'unconfigured') {
      pause('unconfigured')
      return
    }
    schedule(warm ? CACHED_REDIRECT_GRACE_MS : UNCACHED_REDIRECT_GRACE_MS)
  }
  if (!options.settings.primaryUrl && !options.settings.fallbackUrl) {
    pause('unconfigured')
  } else {
    deadlineTimer = setTimer(() => pause('deadline'), options.settings.probeTimeoutMs + 200)
    if (warm) schedule(CACHED_REDIRECT_GRACE_MS)
    else if (Boolean(options.settings.primaryUrl) !== Boolean(options.settings.fallbackUrl)) {
      const onlyUrl = options.settings.primaryUrl || options.settings.fallbackUrl
      if (!snapshot?.failedUrls.includes(onlyUrl) && snapshot?.status !== 'failed') {
        snapshot = {
          ...emptyResolution(options.settings),
          activeUrl: onlyUrl,
          status: 'unverified',
          reason: options.settings.primaryUrl ? 'primary-unverified' : 'fallback-unverified',
        }
        schedule(UNCACHED_REDIRECT_GRACE_MS)
      }
    }
    options.changed(snapshot, paused)
  }
  return { accept, pause, dispose: clear, getSnapshot: () => snapshot }
}
