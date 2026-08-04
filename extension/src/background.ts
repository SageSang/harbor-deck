import { resolveAvailableTarget } from '@extension/network'
import {
  clearNewTabBootSnapshot,
  clearResolutionCache,
  readSettings,
  writeNewTabBootSnapshot,
} from '@extension/storage'

const RESOLUTION_REFRESH_MESSAGE = 'harbordeck:refresh-resolution'
const REFRESH_COOLDOWN_MS = 10_000

let lastRefreshStartedAt = 0
let refreshInFlight: Promise<void> | null = null

async function refreshResolutionCache(force = false): Promise<void> {
  const now = Date.now()
  if (refreshInFlight) {
    return refreshInFlight
  }

  if (!force && now - lastRefreshStartedAt < REFRESH_COOLDOWN_MS) {
    return
  }

  lastRefreshStartedAt = now
  refreshInFlight = (async () => {
    try {
      const settings = await readSettings()
      const target = await resolveAvailableTarget(
        settings.primaryUrl,
        settings.fallbackUrl,
        settings.probeTimeoutMs,
        true
      )
      await writeNewTabBootSnapshot({
        primaryUrl: settings.primaryUrl,
        fallbackUrl: settings.fallbackUrl,
        openMode: settings.openMode,
        activeUrl: target.activeUrl,
        reason: target.reason,
        resolvedAt: Date.now(),
      })
    } catch (error) {
      await clearResolutionCache()
      await clearNewTabBootSnapshot()
      throw error
    }
  })().finally(() => {
    refreshInFlight = null
  })

  return refreshInFlight
}

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage()
})

// Warm the last known network target before the first new-tab request. These
// lifecycle hooks are optional in the local Chrome type shim so older test
// doubles can continue to run without implementing them.
const runtimeLifecycle = chrome.runtime as typeof chrome.runtime & {
  onInstalled?: { addListener(callback: () => void): void }
  onStartup?: { addListener(callback: () => void): void }
}

runtimeLifecycle.onInstalled?.addListener(() => {
  void refreshResolutionCache()
})

runtimeLifecycle.onStartup?.addListener(() => {
  void refreshResolutionCache()
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    typeof message !== 'object' ||
    message === null ||
    !('type' in message) ||
    message.type !== RESOLUTION_REFRESH_MESSAGE
  ) {
    return
  }

  const force =
    typeof message === 'object' &&
    message !== null &&
    'force' in message &&
    message.force === true

  void refreshResolutionCache(force)
    .then(() => sendResponse({ ok: true }))
    .catch(() => sendResponse({ ok: false }))

  return true
})
