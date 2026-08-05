import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAppConfig, fetchNavigationConfig, fetchSystemConfig } from './api'

describe('configuration API reads', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps network failures visible instead of returning default configuration', async () => {
    const networkError = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError))

    await expect(fetchAppConfig()).rejects.toBe(networkError)
    await expect(fetchNavigationConfig()).rejects.toBe(networkError)
    await expect(fetchSystemConfig()).rejects.toBe(networkError)
  })
})
