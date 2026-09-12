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
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.head.replaceChildren()
  document.body.replaceChildren()
})
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
          'sync'
        )
      } else await vi.advanceTimersByTimeAsync(280)
      // Return the old snapshot to model a storage read already in flight when
      // the observed event arrived. It must not override the cancellation.
      finishRead(settings)
      await vi.advanceTimersByTimeAsync(500)
      expect(document.querySelector('script[src*="newtab-app"]')).toBeNull()
    }
  )
})
