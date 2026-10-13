import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startDirect } from './direct'
import { requestResolution, ResolutionSettingsChangedError } from './resolutionClient'
import { emptyResolution } from './resolutionState'
import { RESOLUTION_CACHE_KEY, STORAGE_KEY } from './storage'
import type { ExtensionSettings, NewTabBootSnapshot } from './types'
vi.mock('./resolutionClient', async (original) => ({
  ...(await original<typeof import('./resolutionClient')>()),
  requestResolution: vi.fn(),
}))
const settings: ExtensionSettings = {
  primaryUrl: 'https://deck.test/',
  fallbackUrl: '',
  apiToken: '',
  openMode: 'direct',
  probeTimeoutMs: 1000,
  localExperienceVersion: 1,
  settingsRevision: 'v1',
}
let replace: ReturnType<typeof vi.fn>
let cleanup: (() => void) | undefined
let listeners: Set<(changes: Record<string, unknown>, area: string) => void>
const success = (): NewTabBootSnapshot => ({
  ...emptyResolution(settings),
  activeUrl: settings.primaryUrl,
  status: 'success',
  reason: 'primary',
  verifiedAt: Date.now(),
  lastAttemptAt: Date.now(),
})
const publish = (key: string, value: unknown) =>
  listeners.forEach((fn) => fn({ [key]: { newValue: value } }, 'local'))
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(10000)
  replace = vi.fn()
  listeners = new Set()
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      location: { replace },
      __harborDeckSearchBoot: {
        value: 'half written',
        released: false,
        revision: 1,
        pendingSubmit: false,
        composing: false,
      },
    })
  )
  vi.stubGlobal('chrome', {
    storage: {
      onChanged: {
        addListener: (fn: (changes: Record<string, unknown>, area: string) => void) =>
          listeners.add(fn),
        removeListener: (fn: (changes: Record<string, unknown>, area: string) => void) =>
          listeners.delete(fn),
      },
    },
  })
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  document.body.innerHTML =
    '<p id="boot-status" hidden></p><button id="boot-retry"></button><button id="connection-settings"></button><input id="harbordeck-search-boot-input">'
  vi.mocked(requestResolution).mockReset()
})
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
describe('direct new-tab recovery', () => {
  it('navigates exactly once with the typed query and removes listeners', async () => {
    vi.mocked(requestResolution).mockResolvedValue(success())
    cleanup = await startDirect(settings)
    expect(new URL(replace.mock.calls[0][0]).searchParams.get('harbordeckQuery')).toBe(
      'half written'
    )
    expect(replace).toHaveBeenCalledOnce()
    expect(listeners.size).toBe(0)
  })
  it('waits for final IME text and deduplicates cache, manual and event recovery', async () => {
    window.__harborDeckSearchBoot!.composing = true
    vi.mocked(requestResolution).mockResolvedValue(success())
    cleanup = await startDirect(settings)
    publish(RESOLUTION_CACHE_KEY, success())
    window.dispatchEvent(new Event('online'))
    document.getElementById('boot-retry')!.click()
    expect(replace).not.toHaveBeenCalled()
    window.__harborDeckSearchBoot!.value = '完整输入'
    window.__harborDeckSearchBoot!.composing = false
    document.querySelector('input')!.dispatchEvent(new Event('compositionend'))
    document.querySelector('input')!.dispatchEvent(new Event('compositionend'))
    expect(replace).toHaveBeenCalledOnce()
    expect(new URL(replace.mock.calls[0][0]).searchParams.get('harbordeckQuery')).toBe('完整输入')
  })
  it('automatically retries one transient failure after 800ms', async () => {
    vi.mocked(requestResolution)
      .mockRejectedValueOnce(new Error('worker unavailable'))
      .mockResolvedValueOnce(success())
    cleanup = await startDirect(settings)
    await vi.advanceTimersByTimeAsync(799)
    expect(requestResolution).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(replace).toHaveBeenCalledOnce()
    expect(requestResolution).toHaveBeenLastCalledWith(settings, {
      force: true,
      verifySingle: true,
    })
  })
  it('stops after two failures without polling indefinitely', async () => {
    vi.mocked(requestResolution).mockRejectedValue(new Error('offline'))
    cleanup = await startDirect(settings)
    await vi.advanceTimersByTimeAsync(60000)
    expect(requestResolution).toHaveBeenCalledTimes(2)
    expect(replace).not.toHaveBeenCalled()
    expect(document.getElementById('boot-status')?.hidden).toBe(false)
  })
  it('manual retry cancels the pending automatic retry', async () => {
    vi.mocked(requestResolution)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(success())
    cleanup = await startDirect(settings)
    document.getElementById('boot-retry')!.click()
    await vi.advanceTimersByTimeAsync(1000)
    expect(requestResolution).toHaveBeenCalledTimes(2)
    expect(replace).toHaveBeenCalledOnce()
  })
  it('recovers on online/visible events and coalesces concurrent signals', async () => {
    let finish!: (value: NewTabBootSnapshot) => void
    vi.mocked(requestResolution)
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
    cleanup = await startDirect(settings)
    await vi.advanceTimersByTimeAsync(800)
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('online'))
    expect(requestResolution).toHaveBeenCalledTimes(3)
    finish(success())
    await vi.advanceTimersByTimeAsync(0)
    expect(replace).toHaveBeenCalledOnce()
  })
  it('postpones automatic work while hidden, then retries when visible', async () => {
    vi.mocked(requestResolution)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(success())
    cleanup = await startDirect(settings)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    await vi.advanceTimersByTimeAsync(800)
    expect(requestResolution).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(replace).toHaveBeenCalledOnce()
  })
  it('accepts a fresh late worker publication after the request failed', async () => {
    vi.mocked(requestResolution).mockRejectedValue(new Error('timed out'))
    cleanup = await startDirect(settings)
    await vi.advanceTimersByTimeAsync(1600)
    publish(RESOLUTION_CACHE_KEY, success())
    expect(replace).toHaveBeenCalledOnce()
    expect(requestResolution).toHaveBeenCalledTimes(2)
  })
  it('does not downgrade a cache success when the outstanding request rejects', async () => {
    let reject!: (error: Error) => void
    vi.mocked(requestResolution).mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail
        })
    )
    const start = startDirect(settings)
    publish(RESOLUTION_CACHE_KEY, success())
    reject(new Error('late timeout'))
    cleanup = await start
    await vi.advanceTimersByTimeAsync(5000)
    expect(replace).toHaveBeenCalledOnce()
    expect(requestResolution).toHaveBeenCalledOnce()
    expect(document.getElementById('boot-status')?.hidden).toBe(true)
  })
  it('clears a previous connection error while waiting for composition to finish', async () => {
    vi.mocked(requestResolution).mockRejectedValue(new Error('offline'))
    cleanup = await startDirect(settings)
    window.__harborDeckSearchBoot!.composing = true
    publish(RESOLUTION_CACHE_KEY, success())
    expect(document.getElementById('boot-status')?.hidden).toBe(true)
    expect(replace).not.toHaveBeenCalled()
  })
  it('ignores malformed, old and foreign cache publications', async () => {
    vi.mocked(requestResolution).mockRejectedValue(new Error('offline'))
    cleanup = await startDirect(settings)
    publish(RESOLUTION_CACHE_KEY, { ...success(), verifiedAt: 9999 })
    publish(RESOLUTION_CACHE_KEY, { ...success(), settingsRevision: 'other' })
    publish(RESOLUTION_CACHE_KEY, { ...success(), activeUrl: 'https://wrong.test/' })
    publish(RESOLUTION_CACHE_KEY, { ...success(), status: 'failed' })
    expect(replace).not.toHaveBeenCalled()
  })
  it('invalidates old work and pending composition when settings change', async () => {
    window.__harborDeckSearchBoot!.composing = true
    vi.mocked(requestResolution).mockResolvedValue(success())
    cleanup = await startDirect(settings)
    publish(STORAGE_KEY, { ...settings, settingsRevision: 'v2' })
    window.__harborDeckSearchBoot!.composing = false
    document.querySelector('input')!.dispatchEvent(new Event('compositionend'))
    publish(RESOLUTION_CACHE_KEY, success())
    await vi.advanceTimersByTimeAsync(5000)
    expect(replace).not.toHaveBeenCalled()
    expect(listeners.size).toBe(0)
    expect(document.getElementById('boot-status')?.textContent).toContain('Connection changed')
  })
  it('never automatically retries a settings mismatch', async () => {
    vi.mocked(requestResolution).mockRejectedValue(new ResolutionSettingsChangedError())
    cleanup = await startDirect(settings)
    await vi.advanceTimersByTimeAsync(5000)
    expect(requestResolution).toHaveBeenCalledOnce()
  })
  it.each(['invalid-response', 'permission-missing'] as const)(
    'shows actionable %s without timed retries',
    async (outcome) => {
      vi.mocked(requestResolution).mockResolvedValue({
        ...emptyResolution(settings),
        status: 'failed',
        probeResults: { primary: { outcome, elapsedMs: 10 } },
      })
      cleanup = await startDirect(settings)
      await vi.advanceTimersByTimeAsync(5000)
      expect(requestResolution).toHaveBeenCalledOnce()
      expect(replace).not.toHaveBeenCalled()
      expect(document.getElementById('boot-status')?.textContent).not.toContain(
        'Connection unavailable'
      )
    }
  )
  it('disposes pending timers and late navigation on pagehide', async () => {
    let finish!: (value: NewTabBootSnapshot) => void
    vi.mocked(requestResolution).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const start = startDirect(settings)
    window.dispatchEvent(new Event('pagehide'))
    finish(success())
    cleanup = await start
    await vi.advanceTimersByTimeAsync(5000)
    expect(replace).not.toHaveBeenCalled()
    expect(listeners.size).toBe(0)
  })
})
