import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchAppConfig,
  fetchNavigationConfig,
  fetchSystemConfig,
  saveNavigationConfig,
  saveAppConfig,
  saveSystemConfig,
} from './api'
import { appConfigSchema } from '@/config/schema'
import { cloneNavigationConfig } from '@/features/navigation/navigationConfig'

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

  it('keeps each draft paired with its own revision after other reads complete', async () => {
    const initial = appConfigSchema.parse({
      system: { _revision: 'system-a' },
      navigation: {
        _revision: 'nav-a',
        defaultSceneId: 'main',
        scenes: [{ id: 'main', name: 'Main', groups: [] }],
      },
    })
    let remote = initial
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(remote), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    const draft = await fetchAppConfig()
    remote = {
      ...initial,
      system: { ...initial.system, _revision: 'system-b' },
      navigation: { ...initial.navigation, _revision: 'nav-b' },
    }
    await fetchAppConfig()
    await saveAppConfig(draft)
    expect(new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers).get('If-Match')).toBe(
      '"nav-a/system-a"'
    )

    fetchMock.mockImplementation(async () => new Response(JSON.stringify(initial.navigation)))
    const navDraft = cloneNavigationConfig(await fetchNavigationConfig())
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(remote.navigation)))
    await fetchNavigationConfig()
    await saveNavigationConfig(navDraft)
    expect(new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers).get('If-Match')).toBe('"nav-a"')

    fetchMock.mockImplementation(async () => new Response(JSON.stringify(initial.system)))
    const systemDraft = { ...(await fetchSystemConfig()) }
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(remote.system)))
    await fetchSystemConfig()
    await saveSystemConfig(systemDraft)
    expect(new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers).get('If-Match')).toBe(
      '"system-a"'
    )
  })

  it('rejects unsourced drafts rather than silently using another read revision', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(saveSystemConfig(appConfigSchema.parse({}).system)).rejects.toMatchObject({
      status: 428,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
