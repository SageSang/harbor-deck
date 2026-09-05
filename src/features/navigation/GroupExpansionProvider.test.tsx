import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appConfigSchema } from '@/config/schema'
import {
  COLLAPSED_GROUPS_STORAGE_KEY,
  LEGACY_COLLAPSED_GROUPS_STORAGE_KEY,
} from '@/features/navigation/groupPreference'
import type { GroupExpansionSnapshot } from '@/features/navigation/groupExpansionApi'

const feedbackMocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('@/features/feedback/useFeedback', () => ({
  useFeedback: () => feedbackMocks,
}))

vi.mock('@/i18n/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/i18n/runtime')>()
  return {
    ...actual,
    useI18n: () => ({
      messages: {
        serviceGrid: {
          groupPreferenceInitializeFailed: 'initialize failed',
          groupPreferenceLoadFailed: 'load failed',
          groupPreferenceSaveFailed: 'save failed',
        },
      },
    }),
  }
})

vi.mock('@/features/navigation/useNavigation', () => ({
  useNavigationConfig: vi.fn(),
}))

vi.mock('@/features/navigation/groupExpansionApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/navigation/groupExpansionApi')>()
  return {
    ...actual,
    fetchGroupExpansionPreference: vi.fn(),
    initializeGroupExpansionPreference: vi.fn(),
    saveGroupExpansion: vi.fn(),
    saveSceneGroupExpansion: vi.fn(),
  }
})

import { GroupExpansionProvider } from '@/features/navigation/GroupExpansionProvider'
import {
  fetchGroupExpansionPreference,
  initializeGroupExpansionPreference,
  saveGroupExpansion,
  saveSceneGroupExpansion,
} from '@/features/navigation/groupExpansionApi'
import { useGroupExpansion } from '@/features/navigation/useGroupExpansion'
import { useNavigationConfig } from '@/features/navigation/useNavigation'

const navigation = appConfigSchema.parse({
  navigation: {
    defaultSceneId: 'personal',
    bookmarks: [],
    scenes: [
      {
        id: 'personal',
        name: 'Personal',
        groups: [
          { id: 'main', name: 'Main', bookmarkIds: [] },
          { id: 'tools', name: 'Tools', bookmarkIds: [] },
        ],
      },
      {
        id: 'work',
        name: 'Work',
        groups: [{ id: 'apps', name: 'Apps', bookmarkIds: [] }],
      },
    ],
  },
}).navigation

const emptySnapshot: GroupExpansionSnapshot = {
  initialized: true,
  version: 1,
  expandedGroupKeys: [],
}

function deferredSnapshot() {
  let resolve!: (snapshot: GroupExpansionSnapshot) => void
  const promise = new Promise<GroupExpansionSnapshot>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = []
  static linked = false
  static deliveries = 0

  onmessage: ((event: MessageEvent) => void) | null = null
  postMessage = vi.fn((data: unknown) => {
    if (!FakeBroadcastChannel.linked) return
    for (const peer of FakeBroadcastChannel.instances) {
      if (peer === this) continue
      if (++FakeBroadcastChannel.deliveries > 20) throw new Error('Broadcast echo loop')
      queueMicrotask(() => peer.emit(data))
    }
  })
  close = vi.fn()

  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this)
  }

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null
let queryClient: QueryClient | null = null
let currentExpansion: ReturnType<typeof useGroupExpansion> | null = null

function ExpansionProbe() {
  currentExpansion = useGroupExpansion()
  return null
}

async function renderProvider() {
  container = document.createElement('div')
  document.body.appendChild(container)
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  root = createRoot(container)

  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient!}>
        <GroupExpansionProvider>
          <ExpansionProbe />
        </GroupExpansionProvider>
      </QueryClientProvider>
    )
  })
}

async function waitUntilReady() {
  await act(async () => {
    await vi.waitFor(() => expect(currentExpansion?.isReady).toBe(true))
  })
}

describe('GroupExpansionProvider', () => {
  beforeEach(() => {
    currentExpansion = null
    window.localStorage.clear()
    FakeBroadcastChannel.instances = []
    FakeBroadcastChannel.linked = false
    FakeBroadcastChannel.deliveries = 0
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    vi.mocked(useNavigationConfig).mockReturnValue({ data: navigation } as ReturnType<
      typeof useNavigationConfig
    >)
    vi.mocked(fetchGroupExpansionPreference).mockResolvedValue(emptySnapshot)
    vi.mocked(initializeGroupExpansionPreference).mockResolvedValue(emptySnapshot)
    vi.mocked(saveGroupExpansion).mockResolvedValue(emptySnapshot)
    vi.mocked(saveSceneGroupExpansion).mockResolvedValue(emptySnapshot)
  })

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount())
    }
    queryClient?.clear()
    container?.remove()
    root = null
    queryClient = null
    container = null
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('settles after a save with two communicating tabs', async () => {
    FakeBroadcastChannel.linked = true
    await renderProvider()
    await waitUntilReady()
    const otherHost = document.createElement('div')
    document.body.append(otherHost)
    const otherRoot = createRoot(otherHost)
    const otherClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    try {
      await act(async () =>
        otherRoot.render(
          <QueryClientProvider client={otherClient}>
            <GroupExpansionProvider>
              <ExpansionProbe />
            </GroupExpansionProvider>
          </QueryClientProvider>
        )
      )
      await waitUntilReady()
      expect(fetchGroupExpansionPreference).toHaveBeenCalledTimes(2)
      await act(async () => {
        currentExpansion?.setGroupExpanded('personal', 'main', true)
        await vi.waitFor(() => expect(fetchGroupExpansionPreference).toHaveBeenCalledTimes(4))
      })
      expect(FakeBroadcastChannel.deliveries).toBe(1)
      expect(
        FakeBroadcastChannel.instances.reduce(
          (count, channel) => count + channel.postMessage.mock.calls.length,
          0
        )
      ).toBe(1)
    } finally {
      await act(async () => otherRoot.unmount())
      otherClient.clear()
      otherHost.remove()
    }
  })

  it('allows temporary browsing after preference failure and explicit retry restores server state', async () => {
    vi.mocked(fetchGroupExpansionPreference).mockRejectedValueOnce(new Error('offline'))
    await renderProvider()
    await act(async () => {
      await vi.waitFor(() => expect(feedbackMocks.showToast).toHaveBeenCalled())
    })
    act(() => currentExpansion?.setGroupExpanded('personal', 'main', true))
    expect(currentExpansion?.expandedGroupKeys.has('personal:main')).toBe(true)
    expect(saveGroupExpansion).not.toHaveBeenCalled()
    vi.mocked(fetchGroupExpansionPreference).mockResolvedValue(emptySnapshot)
    await act(async () => {
      currentExpansion?.retry()
      await vi.waitFor(() => expect(currentExpansion?.isReady).toBe(true))
    })
    expect(currentExpansion?.expandedGroupKeys.size).toBe(0)
  })

  it('initializes from legacy state once and clears both local storage keys', async () => {
    window.localStorage.setItem(COLLAPSED_GROUPS_STORAGE_KEY, JSON.stringify(['personal:main']))
    window.localStorage.setItem(LEGACY_COLLAPSED_GROUPS_STORAGE_KEY, JSON.stringify(['work:apps']))
    vi.mocked(fetchGroupExpansionPreference).mockResolvedValue({
      ...emptySnapshot,
      initialized: false,
    })
    vi.mocked(initializeGroupExpansionPreference).mockResolvedValue({
      ...emptySnapshot,
      expandedGroupKeys: ['personal:tools'],
    })

    await renderProvider()
    await waitUntilReady()

    expect(initializeGroupExpansionPreference).toHaveBeenCalledTimes(1)
    expect(initializeGroupExpansionPreference).toHaveBeenCalledWith(['personal:tools'])
    expect(currentExpansion?.expandedGroupKeys).toEqual(new Set(['personal:tools']))
    expect(window.localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(LEGACY_COLLAPSED_GROUPS_STORAGE_KEY)).toBeNull()
  })

  it('rolls back an optimistic group change and reports a save failure', async () => {
    vi.mocked(saveGroupExpansion).mockRejectedValueOnce(new Error('offline'))
    await renderProvider()
    await waitUntilReady()

    act(() => currentExpansion?.setGroupExpanded('personal', 'main', true))
    expect(currentExpansion?.expandedGroupKeys.has('personal:main')).toBe(true)
    expect(currentExpansion?.isGroupPending('personal', 'main')).toBe(true)

    await act(async () => {
      await vi.waitFor(() => expect(feedbackMocks.showToast).toHaveBeenCalledTimes(1))
    })

    expect(currentExpansion?.expandedGroupKeys.has('personal:main')).toBe(false)
    expect(currentExpansion?.isGroupPending('personal', 'main')).toBe(false)
    expect(feedbackMocks.showToast).toHaveBeenCalledWith({
      type: 'error',
      message: 'save failed',
    })
  })

  it('broadcasts successful saves and refreshes valid messages from another tab', async () => {
    const expandedSnapshot = {
      ...emptySnapshot,
      expandedGroupKeys: ['personal:main'],
    }
    vi.mocked(fetchGroupExpansionPreference)
      .mockResolvedValueOnce(emptySnapshot)
      .mockResolvedValue(expandedSnapshot)
    vi.mocked(saveGroupExpansion).mockResolvedValueOnce(expandedSnapshot)
    await renderProvider()
    await waitUntilReady()

    act(() => currentExpansion?.setGroupExpanded('personal', 'main', true))
    await act(async () => {
      await vi.waitFor(() =>
        expect(FakeBroadcastChannel.instances[0]?.postMessage).toHaveBeenCalledWith(
          expandedSnapshot
        )
      )
      await vi.waitFor(() =>
        expect(FakeBroadcastChannel.instances[0]?.postMessage).toHaveBeenCalledTimes(1)
      )
    })

    expect(currentExpansion?.expandedGroupKeys.has('personal:main')).toBe(true)

    vi.mocked(fetchGroupExpansionPreference).mockResolvedValueOnce({
      ...emptySnapshot,
      expandedGroupKeys: ['work:apps'],
    })
    FakeBroadcastChannel.instances[0]?.emit({
      ...emptySnapshot,
      expandedGroupKeys: ['work:apps'],
    })
    await act(async () => {
      await vi.waitFor(() =>
        expect(currentExpansion?.expandedGroupKeys).toEqual(new Set(['work:apps']))
      )
    })
  })

  it('ignores an older refresh that completes after a newer broadcast refresh', async () => {
    const olderRefresh = deferredSnapshot()
    const newerRefresh = deferredSnapshot()
    vi.mocked(fetchGroupExpansionPreference)
      .mockResolvedValueOnce(emptySnapshot)
      .mockReturnValueOnce(olderRefresh.promise)
      .mockReturnValueOnce(newerRefresh.promise)
    await renderProvider()
    await waitUntilReady()

    FakeBroadcastChannel.instances[0]?.emit({
      ...emptySnapshot,
      expandedGroupKeys: ['personal:main'],
    })
    FakeBroadcastChannel.instances[0]?.emit({
      ...emptySnapshot,
      expandedGroupKeys: ['work:apps'],
    })
    expect(fetchGroupExpansionPreference).toHaveBeenCalledTimes(3)

    newerRefresh.resolve({
      ...emptySnapshot,
      expandedGroupKeys: ['work:apps'],
    })
    await act(async () => {
      await vi.waitFor(() =>
        expect(currentExpansion?.expandedGroupKeys).toEqual(new Set(['work:apps']))
      )
    })

    olderRefresh.resolve({
      ...emptySnapshot,
      expandedGroupKeys: ['personal:main'],
    })
    await act(async () => Promise.resolve())
    expect(currentExpansion?.expandedGroupKeys).toEqual(new Set(['work:apps']))
  })

  it('refreshes server state when the window regains focus', async () => {
    vi.mocked(fetchGroupExpansionPreference)
      .mockResolvedValueOnce(emptySnapshot)
      .mockResolvedValueOnce({
        ...emptySnapshot,
        expandedGroupKeys: ['work:apps'],
      })
    await renderProvider()
    await waitUntilReady()

    act(() => window.dispatchEvent(new Event('focus')))
    await act(async () => {
      await vi.waitFor(() =>
        expect(currentExpansion?.expandedGroupKeys).toEqual(new Set(['work:apps']))
      )
    })

    expect(fetchGroupExpansionPreference).toHaveBeenCalledTimes(2)
  })

  it('rolls back a failed scene-wide operation and re-enables the scene', async () => {
    vi.mocked(saveSceneGroupExpansion).mockRejectedValueOnce(new Error('offline'))
    await renderProvider()
    await waitUntilReady()

    let operation: Promise<boolean> | undefined
    act(() => {
      operation = currentExpansion?.setSceneGroupsExpanded('personal', true)
    })
    expect(currentExpansion?.expandedGroupKeys).toEqual(
      new Set(['personal:main', 'personal:tools'])
    )
    expect(currentExpansion?.isScenePending('personal')).toBe(true)

    let succeeded = true
    await act(async () => {
      succeeded = (await operation) ?? true
    })

    expect(succeeded).toBe(false)
    expect(currentExpansion?.expandedGroupKeys).toEqual(new Set())
    expect(currentExpansion?.isScenePending('personal')).toBe(false)
    expect(feedbackMocks.showToast).toHaveBeenCalledWith({
      type: 'error',
      message: 'save failed',
    })
  })
})
