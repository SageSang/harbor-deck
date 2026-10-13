import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  requestResolution,
  ResolutionSettingsChangedError,
  resolutionResponseTimeout,
} from './resolutionClient'
import { emptyResolution } from './resolutionState'
const settings = {
  primaryUrl: 'https://deck.test/',
  fallbackUrl: '',
  apiToken: '',
  openMode: 'direct' as const,
  probeTimeoutMs: 1000,
  settingsRevision: 'v1',
}
const send = vi.fn()
beforeEach(() => {
  vi.useFakeTimers()
  send.mockReset()
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it('allows a cold worker to answer after the former 1200ms deadline', async () => {
  send.mockImplementation(
    () =>
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: true,
              snapshot: { ...emptyResolution(settings), activeUrl: settings.primaryUrl },
            }),
          1400
        )
      )
  )
  const result = requestResolution(settings)
  await vi.advanceTimersByTimeAsync(1400)
  expect((await result).activeUrl).toBe(settings.primaryUrl)
  expect(vi.getTimerCount()).toBe(0)
})
it('bounds an unavailable worker and keeps enough allowance for the largest probe timeout', async () => {
  send.mockReturnValue(new Promise(() => undefined))
  const result = requestResolution(settings).catch((error: Error) => error)
  await vi.advanceTimersByTimeAsync(3000)
  expect(await result).toBeInstanceOf(Error)
  expect(resolutionResponseTimeout({ ...settings, probeTimeoutMs: 5000 })).toBe(7000)
})
it('reports stale settings separately from transient communication errors', async () => {
  send.mockResolvedValue({ ok: false, error: 'settings-changed' })
  await expect(requestResolution(settings)).rejects.toBeInstanceOf(ResolutionSettingsChangedError)
  send.mockResolvedValue({
    ok: true,
    snapshot: emptyResolution({ ...settings, settingsRevision: 'v2' }),
  })
  await expect(requestResolution(settings)).rejects.toBeInstanceOf(ResolutionSettingsChangedError)
})
