import type { ExtensionSettings, NewTabBootSnapshot } from './types'
import { requestResolution, ResolutionSettingsChangedError } from './resolutionClient'
import {
  isFreshResolution,
  matchesSettings,
  normalizeResolution,
  sameSettings,
} from './resolutionState'
import { parseStoredSettings, RESOLUTION_CACHE_KEY, STORAGE_KEY } from './storage'

const RECOVERY_DELAY_MS = 800

/** Explicit compatibility mode. Local mode never navigates to a remote document. */
export async function startDirect(settings: ExtensionSettings) {
  const status = document.getElementById('boot-status')!
  const retry = document.getElementById('boot-retry') as HTMLButtonElement | null
  const input = document.getElementById('harbordeck-search-boot-input')
  document.getElementById('connection-settings')!.hidden = false
  const startedAt = Date.now()
  let alive = true
  let opening = false
  let navigated = false
  let pendingUrl = ''
  let failed = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let lastRecoveryAt = -Infinity

  const message = (text: string) => {
    status.textContent = text
    status.hidden = false
  }
  const clearRetry = () => {
    clearTimeout(retryTimer)
    retryTimer = undefined
  }
  const dispose = () => {
    alive = false
    clearRetry()
    retry?.removeEventListener('click', manualRetry)
    window.removeEventListener('online', recover)
    window.removeEventListener('pagehide', dispose)
    document.removeEventListener('visibilitychange', recover)
    input?.removeEventListener('compositionend', navigate)
    chrome.storage.onChanged?.removeListener?.(storageChanged)
  }
  const invalidate = () => {
    message('连接设置已改变，请重新打开新标签页 / Connection changed; open a new tab')
    if (retry) retry.disabled = true
    dispose()
  }
  function navigate() {
    if (!alive || navigated || !pendingUrl || window.__harborDeckSearchBoot?.composing) return
    navigated = true
    const target = new URL(pendingUrl)
    const query = window.__harborDeckSearchBoot?.value
    if (query) target.searchParams.set('harbordeckQuery', query)
    dispose()
    window.location.replace(target.toString())
  }
  function accept(snapshot: NewTabBootSnapshot) {
    if (!alive || pendingUrl || !matchesSettings(snapshot, settings) || !snapshot.activeUrl)
      return false
    if (!['success', 'unverified'].includes(snapshot.status)) return false
    if (![settings.primaryUrl, settings.fallbackUrl].includes(snapshot.activeUrl)) return false
    pendingUrl = snapshot.activeUrl
    failed = false
    status.hidden = true
    clearRetry()
    if (retry) retry.disabled = true
    navigate()
    return true
  }
  function storageChanged(changes: Record<string, unknown>, area: string) {
    if (!alive || area !== 'local') return
    if (STORAGE_KEY in changes) {
      try {
        const value = (changes[STORAGE_KEY] as { newValue?: unknown }).newValue
        if (!sameSettings(parseStoredSettings(value), settings)) return invalidate()
      } catch {
        return invalidate()
      }
    }
    if (RESOLUTION_CACHE_KEY in changes) {
      const value = (changes[RESOLUTION_CACHE_KEY] as { newValue?: unknown }).newValue
      const snapshot = normalizeResolution(value)
      // Only a fresh success published during this page's lifetime may recover a late reply.
      if (snapshot && isFreshResolution(snapshot, settings) && snapshot.verifiedAt! >= startedAt)
        accept(snapshot)
    }
  }
  async function open(force = false, mayRetry = false) {
    if (!alive || opening || pendingUrl) return
    opening = true
    failed = false
    clearRetry()
    if (retry) retry.disabled = true
    let retryable = true
    try {
      const result = await requestResolution(
        settings,
        force ? { force: true, verifySingle: true } : undefined
      )
      if (!alive || pendingUrl) return
      if (accept(result)) return
      const probes = Object.values(result.probeResults ?? {})
      retryable =
        result.status !== 'unconfigured' &&
        (probes.length === 0 ||
          probes.some(
            (probe) =>
              ['timeout', 'network-error'].includes(probe.outcome) ||
              (probe.outcome === 'http-error' && (probe.httpStatus ?? 0) >= 500)
          ))
      if (result.status === 'unconfigured')
        message('请先在扩展设置中配置服务地址 / Configure a server address in settings')
      else if (probes.some((probe) => probe.outcome === 'invalid-response'))
        message(
          '服务返回登录页或无效响应，请手动打开地址核对 / Open the address to check sign-in or the server response'
        )
      else if (probes.some((probe) => probe.outcome.startsWith('permission-')))
        message('地址权限不足，请在扩展设置中核对 / Check address permissions in settings')
      else
        message('暂时无法连接，请重新检测或手动打开 / Connection unavailable; retry or open a link')
      failed = true
    } catch (error) {
      if (!alive || pendingUrl) return
      if (error instanceof ResolutionSettingsChangedError) return invalidate()
      failed = true
      message('暂时无法连接，请重新检测或手动打开 / Connection unavailable; retry or open a link')
    } finally {
      opening = false
      if (retry) retry.disabled = !alive || Boolean(pendingUrl)
      if (alive && failed && retryable && mayRetry) {
        retryTimer = setTimeout(() => {
          retryTimer = undefined
          if (document.visibilityState !== 'hidden') void open(true)
        }, RECOVERY_DELAY_MS)
      }
    }
  }
  function manualRetry() {
    clearRetry()
    void open(true)
  }
  function recover() {
    if (!alive || !failed || opening || pendingUrl || document.visibilityState === 'hidden') return
    if (Date.now() - lastRecoveryAt < RECOVERY_DELAY_MS) return
    lastRecoveryAt = Date.now()
    void open(true)
  }
  retry?.addEventListener('click', manualRetry)
  window.addEventListener('online', recover)
  window.addEventListener('pagehide', dispose)
  document.addEventListener('visibilitychange', recover)
  input?.addEventListener('compositionend', navigate)
  chrome.storage.onChanged?.addListener(storageChanged)
  await open(false, true)
  return dispose
}
