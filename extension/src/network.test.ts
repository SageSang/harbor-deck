import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { probeAvailableTarget } from './network'
import { emptyResolution } from './resolutionState'
import type { ExtensionSettings } from './types'
const settings: ExtensionSettings = {
  primaryUrl: 'http://lan.test/',
  fallbackUrl: 'https://wan.test/',
  apiToken: '',
  openMode: 'direct',
  probeTimeoutMs: 200,
  settingsRevision: 'v1',
}
const permissions = vi.fn()
beforeEach(() => {
  vi.stubGlobal('chrome', { permissions: { contains: permissions } })
  permissions.mockReset().mockResolvedValue(true)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('address probing', () => {
  it('returns primary success without waiting for secondary', async () => {
    let finishSecondary!: (value: { ok: boolean }) => void
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('lan.test')
          ? Promise.resolve({ ok: true })
          : new Promise((resolve) => {
              finishSecondary = resolve
            })
      )
    )
    const result = await probeAvailableTarget(settings, null)
    expect(result.activeUrl).toBe(settings.primaryUrl)
    expect(result.status).toBe('success')
    finishSecondary({ ok: false })
  })
  it('waits for primary failure before selecting an already healthy secondary', async () => {
    let finishPrimary!: (value: { ok: boolean }) => void
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('wan.test')
          ? Promise.resolve({ ok: true })
          : new Promise((resolve) => {
              finishPrimary = resolve
            })
      )
    )
    let settled = false
    const result = probeAvailableTarget(settings, null).then((value) => {
      settled = true
      return value
    })
    for (let index = 0; index < 10; index++) await Promise.resolve()
    expect(settled).toBe(false)
    finishPrimary({ ok: false })
    expect((await result).activeUrl).toBe(settings.fallbackUrl)
  })
  it('does not mint a fresh successful fallback when both health checks fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const result = await probeAvailableTarget(settings, null)
    expect(result).toMatchObject({
      status: 'failed',
      reason: 'unreachable',
      activeUrl: '',
      verifiedAt: null,
    })
    expect(result.failedUrls).toEqual(
      expect.arrayContaining([settings.primaryUrl, settings.fallbackUrl])
    )
  })
  it('prefers a verified fallback over a primary without permission', async () => {
    permissions.mockImplementation(async ({ origins }: { origins: string[] }) =>
      origins[0].startsWith('https:')
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    expect(await probeAvailableTarget(settings, null)).toMatchObject({
      activeUrl: settings.fallbackUrl,
      status: 'success',
    })
  })
  it('keeps lack of permission unverified, but does not erase an earlier explicit failure', async () => {
    permissions.mockResolvedValue(false)
    const fresh = await probeAvailableTarget(settings, null)
    expect(fresh).toMatchObject({
      activeUrl: settings.primaryUrl,
      status: 'unverified',
      verifiedAt: null,
    })
    const previous = {
      ...emptyResolution(settings),
      status: 'failed' as const,
      failedUrls: [settings.primaryUrl, settings.fallbackUrl],
    }
    expect(await probeAvailableTarget(settings, previous)).toMatchObject({
      activeUrl: '',
      status: 'failed',
      verifiedAt: null,
    })
  })
  it('retains sole-address opening without claiming successful verification', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await probeAvailableTarget({ ...settings, fallbackUrl: '' }, null)).toMatchObject({
      activeUrl: settings.primaryUrl,
      status: 'unverified',
      verifiedAt: null,
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})
