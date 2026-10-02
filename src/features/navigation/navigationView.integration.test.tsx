import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { NavigationViewContext } from './navigationView'
import {
  useActiveSceneServices,
  useNavigationConfig,
  useSaveNavigationConfig,
} from './useNavigation'
import { useAppStore } from '@/store/appStore'
import {
  fetchNavigationConfig,
  fetchSceneList,
  fetchSceneServices,
  saveNavigationConfig,
} from '@/features/config/api'
import { navigationConfigSchema } from '@/config/schema'
import { makeBookmarkSnapshot } from '@shared/bookmarkSnapshot'
vi.mock('@/features/config/api', async (original) => ({
  ...(await original<typeof import('@/features/config/api')>()),
  fetchNavigationConfig: vi.fn(),
  fetchSceneList: vi.fn(),
  fetchSceneServices: vi.fn(),
  saveNavigationConfig: vi.fn(),
}))
let stop: (() => Promise<void>) | undefined
afterEach(async () => {
  await stop?.()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
it('retains an authenticated protected-scene selection while only ordinary cache is available, and never saves that projection', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const live = navigationConfigSchema.parse({
    _revision: 'complete',
    defaultSceneId: 'home',
    bookmarks: [{ slug: 'secret', name: 'Secret', primaryUrl: 'https://secret.test/' }],
    scenes: [
      { id: 'home', name: 'Home', groups: [] },
      {
        id: 'private',
        name: 'Private',
        protected: true,
        groups: [{ id: 'g', name: 'G', bookmarkIds: ['secret'] }],
      },
    ],
  })
  const snapshot = makeBookmarkSnapshot(live, 'https://deck.test/', 'owner')
  let release!: (value: typeof live) => void
  vi.mocked(fetchNavigationConfig).mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve
      })
  )
  vi.mocked(fetchSceneList).mockResolvedValue({ defaultSceneId: 'home', scenes: live.scenes })
  vi.mocked(fetchSceneServices).mockResolvedValue([{ category: 'G', items: live.bookmarks }])
  useAppStore.setState({
    activeSceneId: 'private',
    lastRegularSceneId: 'home',
    sceneTokens: { private: 'session-only' },
    sceneAccessVersion: 17,
  })
  let canEdit = false,
    active: string | null = null,
    attempt: (() => void) | undefined
  function Probe() {
    const navigation = useNavigationConfig(),
      services = useActiveSceneServices(),
      save = useSaveNavigationConfig()
    canEdit = navigation.canEdit
    active = services.activeSceneId
    attempt = () => {
      if (navigation.data) save.mutate(navigation.data)
    }
    return null
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Existing authoritative scene list survives the access-version change during unlock.
  queryClient.setQueryData(['navigation', 'scenes'], {
    defaultSceneId: 'home',
    scenes: live.scenes,
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  stop = async () => {
    await act(async () => root.unmount())
    queryClient.clear()
    host.remove()
    useAppStore.setState({ activeSceneId: null, sceneTokens: {}, sceneAccessVersion: 0 })
  }
  await act(async () =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <NavigationViewContext.Provider value={{ authenticated: true, snapshot }}>
          <Probe />
        </NavigationViewContext.Provider>
      </QueryClientProvider>
    )
  )
  expect(active).toBe('private')
  expect(canEdit).toBe(false)
  await act(async () => attempt?.())
  expect(saveNavigationConfig).not.toHaveBeenCalled()
  await act(async () => release(live))
  await act(async () => {
    await vi.waitFor(() => expect(canEdit).toBe(true))
  })
  expect(active).toBe('private')
})
