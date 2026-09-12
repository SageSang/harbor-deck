import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNewTabController } from './newtabController'
import { emptyResolution, isFreshResolution, normalizeResolution } from './resolutionState'
import type { ExtensionSettings, NewTabBootSnapshot } from './types'

const settings: ExtensionSettings = {
  primaryUrl: 'http://lan.test/',
  fallbackUrl: 'https://wan.test/',
  apiToken: 'secret',
  probeTimeoutMs: 200,
  openMode: 'direct',
  settingsRevision: 'v1',
}
function success(overrides: Partial<NewTabBootSnapshot> = {}) {
  return {
    ...emptyResolution(settings),
    activeUrl: settings.primaryUrl,
    status: 'success' as const,
    reason: 'primary' as const,
    verifiedAt: Date.now(),
    lastAttemptAt: Date.now(),
    ...overrides,
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
})
afterEach(() => vi.useRealTimers())
describe('new tab automatic navigation ownership', () => {
  it('keeps the 120ms warm path and accepts a fresher target without extending it', () => {
    const navigate = vi.fn()
    const controller = createNewTabController({
      settings,
      initial: success(),
      navigate,
      changed: vi.fn(),
    })
    vi.advanceTimersByTime(80)
    controller.accept(success({ activeUrl: settings.fallbackUrl, reason: 'fallback' }))
    vi.advanceTimersByTime(39)
    expect(navigate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ activeUrl: settings.fallbackUrl })
    )
  })
  it('does not use a 31-second-old snapshot and opens a cold success no earlier than 180ms', () => {
    const navigate = vi.fn()
    const controller = createNewTabController({
      settings,
      initial: success({ verifiedAt: Date.now() - 31_000 }),
      navigate,
      changed: vi.fn(),
    })
    vi.advanceTimersByTime(20)
    controller.accept(success())
    vi.advanceTimersByTime(159)
    expect(navigate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(navigate).toHaveBeenCalledOnce()
  })
  it.each(['input', 'hidden', 'offline'] as const)(
    'never rearms after %s, even when results arrive',
    (reason) => {
      const navigate = vi.fn()
      const controller = createNewTabController({
        settings,
        initial: success(),
        navigate,
        changed: vi.fn(),
      })
      controller.pause(reason)
      controller.accept(success())
      vi.runAllTimers()
      expect(navigate).not.toHaveBeenCalled()
    }
  )
  it('ends the default cold budget at 400ms and rejects late automatic navigation', () => {
    const navigate = vi.fn()
    const changed = vi.fn()
    const controller = createNewTabController({ settings, initial: null, navigate, changed })
    vi.advanceTimersByTime(400)
    expect(changed).toHaveBeenLastCalledWith(null, 'deadline')
    controller.accept(success())
    vi.runAllTimers()
    expect(navigate).not.toHaveBeenCalled()
  })
  it('uses the configured slow probe budget rather than a fixed 400ms timeout', () => {
    const changed = vi.fn()
    createNewTabController({
      settings: { ...settings, probeTimeoutMs: 5000 },
      initial: null,
      navigate: vi.fn(),
      changed,
    })
    vi.advanceTimersByTime(5199)
    expect(changed).not.toHaveBeenCalledWith(null, 'deadline')
    vi.advanceTimersByTime(1)
    expect(changed).toHaveBeenCalledWith(null, 'deadline')
  })
  it('opens a sole unverified address after 180ms, but a known failure blocks that exception', () => {
    const single = { ...settings, fallbackUrl: '' }
    const navigate = vi.fn()
    createNewTabController({ settings: single, initial: null, navigate, changed: vi.fn() })
    vi.advanceTimersByTime(180)
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unverified', verifiedAt: null })
    )
    navigate.mockClear()
    createNewTabController({
      settings: single,
      initial: { ...emptyResolution(single), status: 'failed', failedUrls: [single.primaryUrl] },
      navigate,
      changed: vi.fn(),
    })
    vi.runAllTimers()
    expect(navigate).not.toHaveBeenCalled()
  })
  it('does not take a successful response from another settings revision', () => {
    const navigate = vi.fn()
    const controller = createNewTabController({
      settings,
      initial: null,
      navigate,
      changed: vi.fn(),
    })
    controller.accept(success({ settingsRevision: 'v2' }))
    vi.runAllTimers()
    expect(navigate).not.toHaveBeenCalled()
  })
  it('cancels a warm navigation when the new probe explicitly fails', () => {
    const navigate = vi.fn()
    const controller = createNewTabController({
      settings,
      initial: success(),
      navigate,
      changed: vi.fn(),
    })
    controller.accept({
      ...emptyResolution(settings),
      status: 'failed',
      reason: 'unreachable',
      lastAttemptAt: Date.now() + 1,
    })
    vi.runAllTimers()
    expect(navigate).not.toHaveBeenCalled()
  })
  it('never upgrades a legacy resolvedAt into a verified success', () => {
    const old = normalizeResolution({
      primaryUrl: settings.primaryUrl,
      fallbackUrl: settings.fallbackUrl,
      activeUrl: settings.fallbackUrl,
      reason: 'fallback',
      resolvedAt: Date.now(),
    })
    expect(old?.verifiedAt).toBeNull()
    expect(isFreshResolution(old, settings)).toBe(false)
  })
})
