import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createResolutionCoordinator } from './resolutionCoordinator'
import { emptyResolution } from './resolutionState'
import type { ExtensionSettings, NewTabBootSnapshot } from './types'
const mocks = vi.hoisted(() => ({
  readSettings: vi.fn(),
  readResolutionCache: vi.fn(),
  writeResolutionSnapshot: vi.fn(),
  writeExtensionTheme: vi.fn(),
  probeAvailableTarget: vi.fn(),
  fetchRemoteTheme: vi.fn(),
}))
vi.mock('./storage', () => mocks)
vi.mock('./network', () => mocks)
const settings: ExtensionSettings = {
  primaryUrl: 'http://lan.test/',
  fallbackUrl: 'https://wan.test/',
  apiToken: 'secret',
  openMode: 'direct',
  probeTimeoutMs: 200,
  settingsRevision: 'v1',
}
const success = (s = settings): NewTabBootSnapshot => ({
  ...emptyResolution(s),
  activeUrl: s.primaryUrl,
  status: 'success',
  reason: 'primary',
  verifiedAt: Date.now(),
  lastAttemptAt: Date.now(),
})
const flush = async () => {
  for (let n = 0; n < 10; n++) await Promise.resolve()
}
beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.readSettings.mockResolvedValue(settings)
  mocks.readResolutionCache.mockResolvedValue(null)
  mocks.writeResolutionSnapshot.mockResolvedValue(undefined)
  mocks.writeExtensionTheme.mockResolvedValue(undefined)
  mocks.fetchRemoteTheme.mockResolvedValue(null)
})
afterEach(() => vi.restoreAllMocks())
describe('single background resolution writer', () => {
  it('does not join a force refresh to a job for old settings or publish the old result', async () => {
    let oldComplete!: (value: NewTabBootSnapshot) => void
    mocks.probeAvailableTarget.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          oldComplete = resolve
        })
    )
    const coordinator = createResolutionCoordinator()
    const old = coordinator.refresh({ force: true }).catch((error: Error) => error.message)
    await flush()
    const next = {
      ...settings,
      settingsRevision: 'v2',
      primaryUrl: 'https://new.test/',
      openMode: 'embedded' as const,
    }
    mocks.readSettings.mockResolvedValue(next)
    mocks.probeAvailableTarget.mockResolvedValue(success(next))
    await coordinator.refresh({ force: true })
    oldComplete(success())
    expect(await old).toContain('Settings changed')
    expect(mocks.writeResolutionSnapshot).toHaveBeenCalledTimes(1)
    expect(mocks.writeResolutionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ settingsRevision: 'v2' })
    )
  })
  it('publishes and responds before a slow theme, and rejects its later write after invalidation', async () => {
    let themeComplete!: (value: string) => void
    mocks.probeAvailableTarget.mockResolvedValue(success())
    mocks.fetchRemoteTheme.mockImplementation(
      () =>
        new Promise((resolve) => {
          themeComplete = resolve
        })
    )
    const coordinator = createResolutionCoordinator()
    expect((await coordinator.refresh({ force: true })).activeUrl).toBe(settings.primaryUrl)
    expect(mocks.writeResolutionSnapshot).toHaveBeenCalledOnce()
    coordinator.invalidate()
    themeComplete('midnight')
    await flush()
    expect(mocks.writeExtensionTheme).not.toHaveBeenCalled()
  })
  it('coalesces concurrent requests belonging to the same settings', async () => {
    mocks.probeAvailableTarget.mockResolvedValue(success())
    const coordinator = createResolutionCoordinator()
    await Promise.all([coordinator.refresh({ force: true }), coordinator.refresh({ force: true })])
    expect(mocks.probeAvailableTarget).toHaveBeenCalledTimes(1)
  })
  it('invalidates a failed API address before waiting for its recovery probes', async () => {
    mocks.readResolutionCache.mockResolvedValue(success())
    let complete!: (value: NewTabBootSnapshot) => void
    mocks.probeAvailableTarget.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    const request = createResolutionCoordinator().refresh({
      force: true,
      failedUrl: settings.primaryUrl,
    })
    await flush()
    expect(mocks.writeResolutionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        verifiedAt: null,
        failedUrls: [settings.primaryUrl],
      })
    )
    complete(success())
    await request
  })

  it('does not let a caller bypass an in-flight failure recovery with the old fresh cache', async () => {
    mocks.readResolutionCache.mockResolvedValue(success())
    let complete!: (value: NewTabBootSnapshot) => void
    mocks.probeAvailableTarget.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    const coordinator = createResolutionCoordinator()
    const recovery = coordinator.refresh({ force: true, failedUrl: settings.primaryUrl })
    await flush()
    let reused = false
    const concurrent = coordinator.refresh().then((value) => {
      reused = true
      return value
    })
    await flush()
    expect(reused).toBe(false)
    complete(success())
    await Promise.all([recovery, concurrent])
  })

  it('rechecks generation after the final asynchronous settings read', async () => {
    let finishRead!: (value: ExtensionSettings) => void
    mocks.readSettings.mockResolvedValueOnce(settings).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRead = resolve
        })
    )
    mocks.probeAvailableTarget.mockResolvedValue(success())
    const coordinator = createResolutionCoordinator()
    const request = coordinator.refresh({ force: true }).catch((error: Error) => error.message)
    await flush()
    coordinator.invalidate()
    finishRead(settings)
    expect(await request).toContain('Settings changed')
    expect(mocks.writeResolutionSnapshot).not.toHaveBeenCalled()
  })

  it('does not join strong manual verification to a weak single-address task', async () => {
    let finishWeak!: (value: NewTabBootSnapshot) => void
    mocks.probeAvailableTarget
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishWeak = resolve
          })
      )
      .mockResolvedValue(success())
    const coordinator = createResolutionCoordinator()
    const weak = coordinator.refresh({ force: true }).catch(() => undefined)
    await flush()
    await coordinator.refresh({ force: true, verifySingle: true })
    finishWeak(success())
    await weak
    expect(mocks.probeAvailableTarget).toHaveBeenCalledTimes(2)
    expect(mocks.probeAvailableTarget).toHaveBeenLastCalledWith(
      settings,
      null,
      expect.objectContaining({ verifySingle: true })
    )
  })

  it('keeps a healthy cached fallback eligible while rechecking an earlier failed primary', async () => {
    const cached = {
      ...success(),
      activeUrl: settings.fallbackUrl,
      reason: 'fallback' as const,
      failedUrls: [settings.primaryUrl],
    }
    mocks.readResolutionCache.mockResolvedValue(cached)
    let complete!: (value: NewTabBootSnapshot) => void
    mocks.probeAvailableTarget.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    const request = createResolutionCoordinator().refresh({ force: true })
    await flush()
    expect(mocks.writeResolutionSnapshot).not.toHaveBeenCalled()
    complete(cached)
    await request
    expect(mocks.writeResolutionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', activeUrl: settings.fallbackUrl })
    )
  })

  it('publishes a failed attempt without giving it a verified time', async () => {
    mocks.probeAvailableTarget.mockResolvedValue({
      ...emptyResolution(settings),
      status: 'failed',
      reason: 'unreachable',
      lastAttemptAt: Date.now(),
    })
    await createResolutionCoordinator().refresh({ force: true })
    expect(mocks.writeResolutionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', verifiedAt: null })
    )
  })
})
