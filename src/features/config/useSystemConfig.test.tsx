import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { navigationConfigSchema, systemConfigSchema } from '@/config/schema'
import { NavigationViewContext } from '@/features/navigation/navigationView'
import { useBookmarkCache } from '@/features/navigation/useBookmarkCache'
import {
  BOOKMARK_CACHE_CHANGED,
  captureBookmarkCacheScope,
  readBookmarkCache,
  saveBookmarkCache,
  setBookmarkCacheUser,
  updateBookmarkPresentation,
} from '@/features/navigation/bookmarkCache'
import { systemConfigQueryKey } from './api'
import { useSystemConfig } from './useSystemConfig'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

it('settles after caching display settings with multiple mounted consumers, then propagates real changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  setBookmarkCacheUser('owner')
  saveBookmarkCache(navigationConfigSchema.parse(undefined), captureBookmarkCacheScope())
  const queryClient = new QueryClient()
  const system = systemConfigSchema.parse({ appName: 'CPU regression fixture' })
  queryClient.setQueryData(systemConfigQueryKey, system)
  const originalSetItem = Storage.prototype.setItem
  const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key,
    value
  ) {
    // Bound the old infinite feedback loop so the regression fails instead of hanging the runner.
    if (writes.mock.calls.length > 20) throw new Error('Unbounded cache feedback')
    originalSetItem.call(this, key, value)
  })
  let renders = 0
  function Consumer() {
    useSystemConfig()
    renders++
    return null
  }
  function View() {
    const snapshot = useBookmarkCache()
    return (
      <NavigationViewContext.Provider value={{ authenticated: true, snapshot }}>
        <Consumer />
        <Consumer />
        <Consumer />
      </NavigationViewContext.Provider>
    )
  }
  const host = document.createElement('div')
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <View />
        </QueryClientProvider>
      )
    )
    expect(writes).toHaveBeenCalledTimes(1)
    expect(renders).toBeLessThan(15)
    expect(readBookmarkCache()?.display?.appName).toBe(system.appName)

    // Another cache consumer/tab can announce an unchanged snapshot without restarting writes.
    await act(async () => {
      window.dispatchEvent(new Event(BOOKMARK_CACHE_CHANGED))
    })
    expect(writes).toHaveBeenCalledTimes(1)

    // A different tab has fresher settings. This tab's stale query must not echo
    // its previous values back into storage and start a cross-tab feedback loop.
    await act(async () => {
      updateBookmarkPresentation({
        display: { ...readBookmarkCache()!.display!, appName: 'Newer settings from another tab' },
      })
    })
    expect(writes).toHaveBeenCalledTimes(2)
    expect(readBookmarkCache()?.display?.appName).toBe('Newer settings from another tab')

    await act(async () => {
      queryClient.setQueryData(systemConfigQueryKey, { ...system, appName: 'Changed name' })
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(writes).toHaveBeenCalledTimes(3)
    expect(readBookmarkCache()?.display?.appName).toBe('Changed name')
  } finally {
    await act(async () => root.unmount())
    queryClient.clear()
  }
})
