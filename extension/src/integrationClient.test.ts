import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getIntegrationJson,
  integrationRequest,
  IntegrationNetworkError,
} from './integrationClient'
import { requestResolution } from './resolutionClient'
import { emptyResolution } from './resolutionState'
import type { ExtensionSettings } from './types'
vi.mock('./resolutionClient', () => ({ requestResolution: vi.fn() }))
const settings: ExtensionSettings = {
  primaryUrl: 'http://lan.test/',
  fallbackUrl: 'https://wan.test/',
  apiToken: 'token',
  openMode: 'direct',
  probeTimeoutMs: 200,
  settingsRevision: 'v1',
}
beforeEach(() => {
  vi.mocked(requestResolution).mockReset()
  vi.mocked(requestResolution).mockResolvedValue({
    ...emptyResolution(settings),
    activeUrl: settings.fallbackUrl,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('integration network recovery', () => {
  it('retries a failed GET once after refreshing the failed address', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ scenes: [] }) })
    vi.stubGlobal('fetch', fetch)
    expect(
      await getIntegrationJson(settings, '/api/integrations/bookmarks/scenes', settings.primaryUrl)
    ).toEqual({ scenes: [] })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(requestResolution).toHaveBeenCalledWith(settings, {
      force: true,
      failedUrl: settings.primaryUrl,
      verifySingle: true,
    })
  })
  it('does not retry authentication failures or repeat an unsuccessful recovery', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    vi.stubGlobal('fetch', fetch)
    await expect(getIntegrationJson(settings, '/read', settings.primaryUrl)).rejects.toMatchObject({
      status: 401,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(requestResolution).not.toHaveBeenCalled()
    fetch.mockReset().mockRejectedValue(new TypeError('network'))
    await expect(getIntegrationJson(settings, '/read', settings.primaryUrl)).rejects.toBeInstanceOf(
      IntegrationNetworkError
    )
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('bounds stalled response bodies and does not replay a POST', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async (_url, options: RequestInit) => ({
      ok: true,
      json: () =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    }))
    vi.stubGlobal('fetch', fetch)
    const request = integrationRequest(settings.primaryUrl, '/write', settings, {
      timeoutMs: 100,
      body: {
        name: 'Test',
        primaryUrl: 'https://bookmark.test/',
        placements: [],
        recordSceneId: 'home',
      },
    })
    const rejected = expect(request).rejects.toBeInstanceOf(IntegrationNetworkError)
    await vi.advanceTimersByTimeAsync(100)
    await rejected
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(requestResolution).not.toHaveBeenCalled()
  })
})
