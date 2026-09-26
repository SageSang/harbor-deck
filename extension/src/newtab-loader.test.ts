import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyResolution } from './resolutionState'
import type { ExtensionSettings } from './types'
const mocks = vi.hoisted(() => ({
  readSettings: vi.fn(),
  readResolutionCache: vi.fn(),
  readLanguage: vi.fn(),
}))
vi.mock('./storage', () => ({
  ...mocks,
  EXTENSION_THEME_STORAGE_KEY: 'harborDeckExtensionTheme',
  NEW_TAB_BOOT_SNAPSHOT_KEY: 'harborDeckNewTabBootSnapshot',
  STORAGE_KEY: 'harborDeckNewTabSettings',
}))
const settings: ExtensionSettings = {
  primaryUrl: 'https://deck.test/',
  fallbackUrl: 'https://backup.test/',
  apiToken: 'never-in-public-snapshot',
  probeTimeoutMs: 200,
  openMode: 'embedded',
  settingsRevision: 'v1',
}
const state = () => ({
  ...emptyResolution(settings),
  activeUrl: settings.primaryUrl,
  status: 'success' as const,
  reason: 'primary' as const,
  verifiedAt: Date.now(),
  lastAttemptAt: Date.now(),
})
let sendMessage: ReturnType<typeof vi.fn>
let storageChanged: (changes: Record<string, unknown>, area: string) => void
let listeners: Array<{
  target: EventTarget
  type: string
  listener: EventListenerOrEventListenerObject
}> = []
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  listeners = []
  for (const target of [window, document]) {
    const add = target.addEventListener.bind(target)
    vi.spyOn(target, 'addEventListener').mockImplementation(
      (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
      ) => {
        listeners.push({ target, type, listener: listener as EventListener })
        add(type, listener, options)
      }
    )
  }
  document.head.replaceChildren()
  document.body.innerHTML =
    '<section id="harbordeck-instant-shell"><form id="harbordeck-instant-form"><input id="harbordeck-instant-input"><p id="harbordeck-instant-status"></p><button id="harbordeck-instant-action"></button></form></section><div id="root"></div>'
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.readSettings.mockResolvedValue(settings)
  mocks.readResolutionCache.mockImplementation(async () => state())
  mocks.readLanguage.mockResolvedValue('en')
  sendMessage = vi.fn().mockImplementation(() => new Promise(() => undefined))
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: async () => ({}) },
      onChanged: {
        addListener: (listener: typeof storageChanged) => {
          storageChanged = listener
        },
      },
    },
    runtime: { sendMessage, openOptionsPage: vi.fn() },
  })
})
afterEach(() => {
  for (const { target, type, listener } of listeners) target.removeEventListener(type, listener)
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.head.replaceChildren()
  document.body.replaceChildren()
})
const retryButton = () =>
  [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Check again and open'
  )!
async function pausedLoader() {
  mocks.readResolutionCache.mockResolvedValue(null)
  await import('./newtab-loader')
  await vi.advanceTimersByTimeAsync(400)
  expect(document.querySelector('script[src*="newtab-app"]')).toBeNull()
  expect(retryButton()).toBeTruthy()
}
describe('built-app handoff from the lightweight loader', () => {
  it('loads the embedded entry and its stylesheet after the warm window, without publishing a token', async () => {
    await import('./newtab-loader')
    await vi.advanceTimersByTimeAsync(119)
    expect(document.querySelector('script[src*="newtab-app"]')).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(document.querySelector('script[src*="assets/newtab-app.js"]')).not.toBeNull()
    expect(
      document.querySelector('link[rel="stylesheet"][href*="assets/styles.css"]')
    ).not.toBeNull()
    expect(JSON.stringify(window.__harborDeckBootSnapshot)).not.toContain(settings.apiToken)
  })
  it('does not load an iframe after a settings change invalidates the chosen cache', async () => {
    await import('./newtab-loader')
    await vi.advanceTimersByTimeAsync(20)
    mocks.readSettings.mockResolvedValue({ ...settings, settingsRevision: 'v2' })
    await vi.advanceTimersByTimeAsync(120)
    expect(document.querySelector('script[src*="newtab-app"]')).toBeNull()
  })
  it('rejects a known failure published while its warm navigation was waiting', async () => {
    await import('./newtab-loader')
    await vi.advanceTimersByTimeAsync(100)
    mocks.readResolutionCache.mockResolvedValue({
      ...emptyResolution(settings),
      status: 'failed',
      reason: 'unreachable',
      lastAttemptAt: Date.now(),
      failedUrls: [settings.primaryUrl],
    })
    await vi.advanceTimersByTimeAsync(20)
    expect(document.querySelector('script[src*="newtab-app"]')).toBeNull()
  })

  it('preserves early input and does not rearm when the worker later returns a success', async () => {
    let complete!: (value: unknown) => void
    sendMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    await import('./newtab-loader')
    await vi.advanceTimersByTimeAsync(20)
    const input = document.querySelector('input')!
    input.value = 'keep my words'
    input.dispatchEvent(new Event('input'))
    complete({ ok: true, snapshot: state() })
    await vi.advanceTimersByTimeAsync(500)
    expect(input.value).toBe('keep my words')
    expect(document.querySelector('script[src*="newtab-app"]')).toBeNull()
    expect(document.getElementById('harbordeck-instant-status')?.textContent).toContain('paused')
  })

  it.each(['failure', 'settings', 'deadline'])(
    'cancels %s during the final storage check',
    async (reason) => {
      let finishRead!: (value: ExtensionSettings) => void
      mocks.readSettings.mockResolvedValueOnce(settings).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRead = resolve
          })
      )
      await import('./newtab-loader')
      await vi.advanceTimersByTimeAsync(120)
      if (reason === 'failure') {
        storageChanged(
          {
            harborDeckNewTabBootSnapshot: {
              newValue: {
                ...emptyResolution(settings),
                status: 'failed',
                reason: 'unreachable',
                lastAttemptAt: Date.now(),
                failedUrls: [settings.primaryUrl],
              },
            },
          },
          'local'
        )
      } else if (reason === 'settings') {
        storageChanged(
          { harborDeckNewTabSettings: { newValue: { ...settings, settingsRevision: 'v2' } } },
          'local'
        )
      } else await vi.advanceTimersByTimeAsync(280)
      // Return the old snapshot to model a storage read already in flight when
      // the observed event arrived. It must not override the cancellation.
      finishRead(settings)
      await vi.advanceTimersByTimeAsync(500)
      expect(document.querySelector('script[src*="newtab-app"]')).toBeNull()
    }
  )

  it('opens once after an explicit retry from a timed-out page', async () => {
    await pausedLoader()
    sendMessage.mockResolvedValue({ ok: true, snapshot: state() })
    retryButton().click()
    await vi.advanceTimersByTimeAsync(0)
    expect(document.querySelectorAll('script[src*="newtab-app"]')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(document.querySelectorAll('script[src*="newtab-app"]')).toHaveLength(1)
  })

  it.each(['input', 'hidden', 'offline', 'settings', 'timeout'])(
    'cancels an explicit retry when %s occurs, even if success arrives later',
    async (reason) => {
      await pausedLoader()
      let finish!: (value: unknown) => void
      sendMessage.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      retryButton().click()
      await vi.advanceTimersByTimeAsync(0)
      if (reason === 'input') {
        const input = document.querySelector('input')!
        input.value = 'new words'
        input.dispatchEvent(new Event('input'))
      } else if (reason === 'hidden') {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
        document.dispatchEvent(new Event('visibilitychange'))
      } else if (reason === 'offline') window.dispatchEvent(new Event('offline'))
      else if (reason === 'settings')
        storageChanged({ harborDeckNewTabSettings: { newValue: {} } }, 'local')
      else await vi.advanceTimersByTimeAsync(400)
      finish({ ok: true, snapshot: state() })
      await vi.advanceTimersByTimeAsync(500)
      expect(document.querySelector('script[src*="newtab-app"]')).toBeNull()
      expect(retryButton()).toBeTruthy()
      if (reason === 'input') expect(document.querySelector('input')?.value).toBe('new words')
    }
  )

  it('does not let an old recovery response complete a newer attempt', async () => {
    await pausedLoader()
    const completions: Array<(value: unknown) => void> = []
    sendMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          completions.push(resolve)
        })
    )
    const retry = retryButton()
    retry.click()
    await vi.advanceTimersByTimeAsync(0)
    retry.click()
    await vi.advanceTimersByTimeAsync(0)
    completions[0]({ ok: true, snapshot: state() })
    await vi.advanceTimersByTimeAsync(0)
    expect(document.querySelector('script[src*="newtab-app"]')).toBeNull()
    completions[1]({ ok: true, snapshot: state() })
    await vi.advanceTimersByTimeAsync(0)
    expect(document.querySelectorAll('script[src*="newtab-app"]')).toHaveLength(1)
  })

  it.each(['failed', 'unverified'] as const)(
    'keeps manual addresses when retry result is %s',
    async (status) => {
      await pausedLoader()
      sendMessage.mockResolvedValue({ ok: true, snapshot: { ...state(), status } })
      retryButton().click()
      await vi.advanceTimersByTimeAsync(0)
      expect(document.querySelector('script[src*="newtab-app"]')).toBeNull()
      expect([...document.querySelectorAll('a')].map((link) => link.href)).toContain(
        settings.primaryUrl
      )
    }
  )

  it('allows explicit recovery after an initially hidden tab becomes visible, retaining typed text', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await import('./newtab-loader')
    await vi.advanceTimersByTimeAsync(500)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(document.querySelector('script[src*="newtab-app"]')).toBeNull()
    document.querySelector('input')!.value = 'keep this query'
    sendMessage.mockResolvedValue({ ok: true, snapshot: state() })
    retryButton().click()
    await vi.advanceTimersByTimeAsync(0)
    expect(window.__harborDeckBootSnapshot?.activeUrl).toContain('harbordeckQuery=keep+this+query')
  })

  it('ignores sync connection changes after switching settings to local storage', async () => {
    await import('./newtab-loader')
    await vi.advanceTimersByTimeAsync(20)
    storageChanged(
      { harborDeckNewTabSettings: { newValue: { ...settings, settingsRevision: 'other-device' } } },
      'sync'
    )
    await vi.advanceTimersByTimeAsync(100)
    expect(document.querySelector('script[src*="newtab-app"]')).not.toBeNull()
  })

  it('uses the newly loaded timeout for a manual attempt', async () => {
    await pausedLoader()
    const updated = { ...settings, probeTimeoutMs: 1500, settingsRevision: 'v2' }
    mocks.readSettings.mockResolvedValue(updated)
    let finish!: (value: unknown) => void
    sendMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    retryButton().click()
    await vi.advanceTimersByTimeAsync(800)
    finish({ ok: true, snapshot: { ...state(), ...updated, apiToken: undefined } })
    await vi.advanceTimersByTimeAsync(0)
    expect(document.querySelector('script[src*="newtab-app"]')).not.toBeNull()
  })

  it('preserves input arriving during the final manual-recovery storage check', async () => {
    await pausedLoader()
    let finish!: (value: ExtensionSettings) => void
    mocks.readSettings.mockResolvedValueOnce(settings).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    sendMessage.mockResolvedValue({ ok: true, snapshot: state() })
    retryButton().click()
    await vi.advanceTimersByTimeAsync(0)
    document.querySelector('input')!.dispatchEvent(new Event('input'))
    finish(settings)
    await vi.advanceTimersByTimeAsync(0)
    expect(document.querySelector('script[src*="newtab-app"]')).toBeNull()
  })
  it('shows per-address failure details on the paused page', async () => {
    mocks.readResolutionCache.mockResolvedValue(null)
    sendMessage.mockResolvedValue({
      ok: true,
      snapshot: {
        ...state(),
        status: 'failed',
        activeUrl: '',
        probeResults: {
          primary: { outcome: 'timeout', elapsedMs: 200 },
          fallback: { outcome: 'http-error', elapsedMs: 80, httpStatus: 503 },
        },
      },
    })
    await import('./newtab-loader')
    await vi.advanceTimersByTimeAsync(400)
    expect(document.body.textContent).toContain('Timed out; increase the check timeout')
    expect(document.body.textContent).toContain('HTTP 503')
    expect(document.querySelector('script[src*="newtab-app"]')).toBeNull()
  })
})
