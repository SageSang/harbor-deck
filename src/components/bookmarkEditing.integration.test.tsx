import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@/app/providers'
import { navigationConfigSchema, type NavigationConfig } from '@/config/schema'
import { defaultSystemConfig } from '@/config/defaultConfig'
import { navigationConfigQueryKey, systemConfigQueryKey } from '@/features/config/api'
import { useNavigationConfig, useSaveNavigationConfig } from '@/features/navigation/useNavigation'
import { GroupExpansionProvider } from '@/features/navigation/GroupExpansionProvider'
import { BookmarkEditDialog } from '@/features/services/BookmarkEditDialog'
import { QuickRecordEditDialog } from '@/features/services/QuickRecordEditDialog'
import { ServiceGrid } from '@/features/services/ServiceGrid'
import { resolveSceneServices } from '@/features/navigation/navigationConfig'
import { useAppStore } from '@/store/appStore'
import { BookmarkManageButton } from './BookmarkManageButton'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function fixture(revision = 'r1') {
  return navigationConfigSchema.parse({
    _revision: revision,
    defaultSceneId: 'a',
    bookmarks: [
      {
        slug: 'first',
        name: 'First bookmark',
        icon: 'bookmark',
        primaryUrl: 'https://first.example/',
      },
      {
        slug: 'second',
        name: 'Second bookmark',
        icon: 'bookmark',
        primaryUrl: 'https://second.example/',
      },
    ],
    scenes: [
      {
        id: 'a',
        name: 'Scene A',
        groups: [
          { id: 'one', name: 'One', bookmarkIds: ['first'] },
          { id: 'two', name: 'Two', bookmarkIds: ['second'] },
        ],
        quickRecords: [
          {
            id: 'q1',
            name: 'First record',
            primaryUrl: 'https://record.example/',
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'q2',
            name: 'Second record',
            primaryUrl: 'https://record2.example/',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      { id: 'b', name: 'Scene B', groups: [] },
    ],
  })
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let root: Root
let host: HTMLDivElement
let client: QueryClient
let serverNavigation: NavigationConfig
let writes: Array<{ config: NavigationConfig; response: ReturnType<typeof deferred<Response>> }>
let readNavigation: () => Promise<Response>
let navigationReads: number
let save: ReturnType<typeof useSaveNavigationConfig>

function CaptureClient() {
  client = useQueryClient()
  return null
}

function SaveProbe({ scope = 'a' }: { scope?: string }) {
  useNavigationConfig()
  save = useSaveNavigationConfig(scope)
  return null
}

async function flush() {
  for (let index = 0; index < 3; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(children: ReactNode) {
  await act(async () =>
    root.render(
      <Providers>
        <CaptureClient />
        {children}
      </Providers>
    )
  )
  await flush()
}

function navigationKey() {
  return [...navigationConfigQueryKey, useAppStore.getState().sceneAccessVersion]
}

async function refreshTo(navigation: NavigationConfig) {
  await act(async () => {
    client.setQueryData(navigationKey(), navigation)
  })
  await flush()
}

function inputByLabel(label: string) {
  const input = Array.from(document.querySelectorAll('input')).find(
    (item) => item.getAttribute('aria-label') === label
  )
  expect(input, label).toBeTruthy()
  return input!
}

async function change(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function click(text: string, within: ParentNode = document) {
  const button = Array.from(within.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === text
  )
  expect(button, text).toBeTruthy()
  await act(async () => button!.click())
  await flush()
}

async function selectScene(id: string) {
  await act(async () => {
    const selector = document.querySelector('select')!
    selector.value = id
    selector.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await flush()
}

async function sceneTab() {
  const button = Array.from(document.querySelectorAll('button')).find((item) =>
    item.textContent?.includes('新增、复制、保护和删除')
  )!
  expect(button).toBeTruthy()
  await act(async () => button.click())
  await flush()
}

async function finishWrite(index = 0, revision = 'r2', updateServer = true) {
  const saved = navigationConfigSchema.parse({ ...writes[index].config, _revision: revision })
  if (updateServer) serverNavigation = saved
  await act(async () => writes[index].response.resolve(json(saved)))
  await flush()
  return saved
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  serverNavigation = fixture()
  writes = []
  navigationReads = 0
  readNavigation = async () => json(serverNavigation)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url === '/api/config/navigation') {
        if (options?.method === 'PUT') {
          const response = deferred<Response>()
          writes.push({ config: JSON.parse(String(options.body)), response })
          return response.promise
        }
        navigationReads += 1
        return readNavigation()
      }
      if (url === '/api/config/system') return json(defaultSystemConfig)
      if (url === '/api/navigation/scenes')
        return json({
          defaultSceneId: serverNavigation.defaultSceneId,
          scenes: serverNavigation.scenes.map(({ id, name, protected: protectedScene }) => ({
            id,
            name,
            protected: protectedScene,
          })),
        })
      if (url.startsWith('/api/navigation?'))
        return json(
          resolveSceneServices(
            serverNavigation,
            new URL(url, 'http://localhost').searchParams.get('sceneId')!
          )
        )
      if (url === '/api/preferences/navigation/groups')
        return json({ initialized: true, version: 1, expandedGroupKeys: ['a:one', 'a:two'] })
      throw new Error(`Unexpected test request: ${url}`)
    })
  )
  useAppStore.setState({
    activeSceneId: 'a',
    lastRegularSceneId: 'a',
    sceneTokens: {},
    searchKeyword: '',
    language: 'zh-CN',
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await render(null)
  client.clear()
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } })
  client.setQueryData(navigationKey(), serverNavigation)
  client.setQueryData(systemConfigQueryKey, defaultSystemConfig)
})

afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('bookmark management with the production query/cache boundary', () => {
  it('accepts only the submitted group and keeps edits made during the request', async () => {
    await render(<BookmarkManageButton initialOpen />)
    const one = inputByLabel('分组名称 One')
    await change(one, '  One saved  ')
    await change(inputByLabel('分组名称 Two'), 'Two draft')
    await click('保存', one.closest('.config-panel-card')!)
    expect(writes[0].config.scenes[0].groups[0].name).toBe('One saved')
    await change(one, 'One typed while saving')
    await finishWrite()
    expect(inputByLabel('分组名称 One saved').value).toBe('One typed while saving')
    expect(inputByLabel('分组名称 Two').value).toBe('Two draft')
    expect(document.body.textContent).not.toContain('服务器数据已更新')
    await click('保存', inputByLabel('分组名称 Two').closest('.config-panel-card')!)
    expect(writes[1].config._revision).toBe('r2')
    await finishWrite(1, 'r3')
    expect(inputByLabel('分组名称 One saved').value).toBe('One typed while saving')
    expect(inputByLabel('分组名称 Two draft').value).toBe('Two draft')
  })

  it('updates clean groups and retains changed/deleted dirty groups for comparison', async () => {
    await render(<BookmarkManageButton initialOpen />)
    await change(inputByLabel('分组名称 Two'), 'Two draft')
    const remote = fixture('remote')
    remote.scenes[0].groups[0].name = 'One remote'
    remote.scenes[0].groups[1].name = 'Two remote'
    remote.scenes[0].groups.push({ id: 'three', name: 'Three remote', bookmarkIds: [] })
    await refreshTo(remote)
    expect(inputByLabel('分组名称 One remote').value).toBe('One remote')
    expect(inputByLabel('分组名称 Two remote').value).toBe('Two draft')
    expect(inputByLabel('分组名称 Three remote').value).toBe('Three remote')
    expect(document.body.textContent).toContain('服务器数据已更新')
    const deleted = structuredClone(remote)
    deleted.scenes[0].groups.splice(1, 1)
    await refreshTo(deleted)
    expect(inputByLabel('已删除分组的草稿 Two').value).toBe('Two draft')
    expect(document.body.textContent).toContain('已在服务器删除')
    expect(writes).toHaveLength(0)
  })

  it('preserves a scene name typed after submitting its previous name', async () => {
    await render(<BookmarkManageButton initialOpen />)
    await sceneTab()
    await change(inputByLabel('场景名称'), 'Scene saved')
    await click('保存名称')
    await change(inputByLabel('场景名称'), 'Scene continued')
    await finishWrite()
    expect(inputByLabel('场景名称').value).toBe('Scene continued')
    expect(client.getQueryData<NavigationConfig>(navigationKey())?.scenes[0].name).toBe(
      'Scene saved'
    )
  })

  it('keeps a superseded successful name visible as a conflict', async () => {
    await render(<BookmarkManageButton initialOpen />)
    const one = inputByLabel('分组名称 One')
    await change(one, 'Our saved name')
    await click('保存', one.closest('.config-panel-card')!)
    serverNavigation = fixture('after-our-save')
    serverNavigation.scenes[0].groups[0].name = 'Later remote name'
    await refreshTo(serverNavigation)
    await finishWrite(0, 'our-save', false)
    expect(inputByLabel('分组名称 Later remote name').value).toBe('Our saved name')
    expect(document.body.textContent).toContain('服务器数据已更新')
  })

  it('preserves the submitted draft and reports a 412 without another PUT', async () => {
    await render(<BookmarkManageButton initialOpen />)
    const one = inputByLabel('分组名称 One')
    await change(one, 'Local input')
    await click('保存', one.closest('.config-panel-card')!)
    serverNavigation = fixture('remote')
    serverNavigation.scenes[0].groups[0].name = 'Remote input'
    await act(async () =>
      writes[0].response.resolve(new Response('revision conflict', { status: 412 }))
    )
    await flush()
    expect(inputByLabel('分组名称 Remote input').value).toBe('Local input')
    expect(document.body.textContent).toContain('revision conflict')
    expect(document.body.textContent).toContain('服务器数据已更新')
    expect(writes).toHaveLength(1)
  })

  it.each(['create', 'duplicate'])(
    'selects the %s result from the PUT response without an extra navigation GET',
    async (mode) => {
      await render(<BookmarkManageButton initialOpen />)
      await sceneTab()
      if (mode === 'create') {
        await change(document.querySelector('input[placeholder="新场景名称"]')!, 'Created scene')
        await click('新增场景')
      } else {
        await click('复制场景')
      }
      const createdId = writes[0].config.scenes[writes[0].config.scenes.length - 1].id
      await finishWrite()
      expect(document.querySelector('select')?.value).toBe(createdId)
      expect(navigationReads).toBe(0)
    }
  )

  it('separates committed writes from refresh failures and retries only GET', async () => {
    await render(<BookmarkManageButton initialOpen />)
    await sceneTab()
    await change(document.querySelector('input[placeholder="新场景名称"]')!, 'Created scene')
    await click('新增场景')
    await refreshTo(fixture('another-read'))
    readNavigation = async () => {
      throw new Error('GET unavailable')
    }
    const saved = await finishWrite()
    expect(document.body.textContent).toContain('已保存，但页面同步失败')
    expect(
      Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent === '新增场景'
      )?.disabled
    ).toBe(true)
    readNavigation = async () => json(saved)
    await click('仅重新读取')
    expect(writes).toHaveLength(1)
    expect(document.querySelector('select')?.value).toBe(saved.scenes[saved.scenes.length - 1].id)
    expect(document.body.textContent).not.toContain('已保存，但页面同步失败')
  })

  it('keeps the existing fallback when the created scene was already deleted elsewhere', async () => {
    await render(<BookmarkManageButton initialOpen />)
    await sceneTab()
    await change(document.querySelector('input[placeholder="新场景名称"]')!, 'Created scene')
    await click('新增场景')
    serverNavigation = fixture('removed-after-save')
    await refreshTo(serverNavigation)
    await finishWrite(0, 'saved-before-removal', false)
    expect(document.querySelector('select')?.value).toBe('a')
    expect(document.body.textContent).toContain('该场景随后已被移除')
    expect(writes).toHaveLength(1)
  })

  it('does not run a save callback for another selected scene', async () => {
    await render(<BookmarkManageButton initialOpen />)
    const one = inputByLabel('分组名称 One')
    await change(one, 'One saved')
    await click('保存', one.closest('.config-panel-card')!)
    await selectScene('b')
    await finishWrite()
    expect(document.querySelector('select')?.value).toBe('b')
    expect(document.body.textContent).not.toContain('分组名称已更新。')
  })
})

describe('navigation save ordering and access isolation', () => {
  it('cancels a stale GET before adopting the save response', async () => {
    await render(<SaveProbe />)
    const oldRead = deferred<Response>()
    readNavigation = () => oldRead.promise
    const pendingRead = client.refetchQueries({ queryKey: navigationKey(), exact: true })
    await flush()
    const success = vi.fn()
    await act(async () => save.mutate(fixture(), { onSuccess: success }))
    await flush()
    await finishWrite()
    await act(async () => oldRead.resolve(json(fixture('stale'))))
    await pendingRead
    await flush()
    expect(client.getQueryData<NavigationConfig>(navigationKey())?._revision).toBe('r2')
    expect(success).toHaveBeenCalledOnce()
  })

  it('rechecks the access version after awaiting cancellation', async () => {
    await render(<SaveProbe />)
    const beforeKey = navigationKey()
    const success = vi.fn()
    await act(async () => save.mutate(fixture(), { onSuccess: success }))
    await flush()
    const barrier = deferred<void>()
    const cancel = client.cancelQueries.bind(client)
    vi.spyOn(client, 'cancelQueries').mockImplementationOnce(async (filters, options) => {
      await cancel(filters, options)
      await barrier.promise
    })
    writes[0].response.resolve(json(fixture('private-saved')))
    await flush()
    await act(async () => useAppStore.getState().clearSceneTokens())
    await act(async () => barrier.resolve())
    await flush()
    expect(client.getQueryData(beforeKey)).toBeUndefined()
    expect(client.getQueryData<NavigationConfig>(navigationKey())?._revision).not.toBe(
      'private-saved'
    )
    expect(success).not.toHaveBeenCalled()
  })

  it('does not resurrect a removed access snapshot after logout and a new login', async () => {
    await render(<SaveProbe />)
    const beforeKey = navigationKey()
    const success = vi.fn()
    await act(async () => save.mutate(fixture(), { onSuccess: success }))
    await flush()
    serverNavigation = fixture('new-session')
    await act(async () => {
      useAppStore.getState().clearSceneTokens()
      useAppStore.getState().clearSceneTokens()
    })
    await flush()
    await finishWrite(0, 'old-session', false)
    expect(client.getQueryData(beforeKey)).toBeUndefined()
    expect(client.getQueryData<NavigationConfig>(navigationKey())?._revision).toBe('new-session')
    expect(success).not.toHaveBeenCalled()
  })

  it('does not infer ordering from an A-to-B-to-A content hash', async () => {
    await render(<SaveProbe />)
    const success = vi.fn()
    await act(async () => save.mutate(fixture(), { onSuccess: success }))
    await flush()
    await refreshTo(fixture('rB'))
    await refreshTo(fixture('r1'))
    await finishWrite(0, 'older-committed-result', false)
    expect(navigationReads).toBe(1)
    expect(client.getQueryData<NavigationConfig>(navigationKey())?._revision).toBe('r1')
    expect(success.mock.calls[0][1]._revision).toBe('r1')
  })

  it('re-reads when the exact query instance was replaced during the request', async () => {
    await render(<SaveProbe />)
    await act(async () => save.mutate(fixture()))
    await flush()
    client.removeQueries({ queryKey: navigationKey(), exact: true })
    client.setQueryData(navigationKey(), fixture())
    await finishWrite()
    expect(navigationReads).toBe(1)
    expect(client.getQueryData<NavigationConfig>(navigationKey())?._revision).toBe('r2')
  })

  it('does not regress the cache when two editor instances receive responses out of order', async () => {
    let firstSave!: ReturnType<typeof useSaveNavigationConfig>
    let secondSave!: ReturnType<typeof useSaveNavigationConfig>
    function TwoEditors() {
      useNavigationConfig()
      firstSave = useSaveNavigationConfig('first-editor')
      secondSave = useSaveNavigationConfig('second-editor')
      return null
    }
    await render(<TwoEditors />)
    await act(async () => firstSave.mutate(fixture()))
    await flush()
    await refreshTo(fixture('r2'))
    await act(async () => secondSave.mutate(fixture('r2')))
    await flush()
    await finishWrite(1, 'r3')
    await finishWrite(0, 'r2', false)
    expect(client.getQueryData<NavigationConfig>(navigationKey())?._revision).toBe('r3')
    expect(navigationReads).toBe(1)
  })

  it('invalidates callbacks when an editor closes and reopens with the same identity', async () => {
    const success = vi.fn()
    await render(<SaveProbe scope="open:a" />)
    await act(async () => save.mutate(fixture(), { onSuccess: success }))
    await flush()
    await render(<SaveProbe scope="closed:a" />)
    await render(<SaveProbe scope="open:a" />)
    await finishWrite()
    expect(success).not.toHaveBeenCalled()
  })
})

describe('shared editor callers', () => {
  it('does not close a different bookmark editor after a late save', async () => {
    const closed = vi.fn()
    await render(<BookmarkEditDialog open serviceSlug="first" onClose={closed} />)
    const form = document.querySelector('form')!
    await act(async () =>
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    )
    await flush()
    expect(writes).toHaveLength(1)
    await render(<BookmarkEditDialog open serviceSlug="second" onClose={closed} />)
    await finishWrite()
    expect(closed).not.toHaveBeenCalled()
    expect(
      Array.from(document.querySelectorAll('input')).some(
        (input) => input.value === 'Second bookmark'
      )
    ).toBe(true)
  })

  it('does not close a different quick record editor after a late save', async () => {
    const closed = vi.fn()
    await render(<QuickRecordEditDialog open sceneId="a" recordId="q1" onClose={closed} />)
    await click('保存')
    await render(<QuickRecordEditDialog open sceneId="a" recordId="q2" onClose={closed} />)
    await finishWrite()
    expect(closed).not.toHaveBeenCalled()
    expect(
      Array.from(document.querySelectorAll('input')).some(
        (input) => input.value === 'Second record'
      )
    ).toBe(true)
  })

  it('renders the saved navigation in the service grid after a group rename', async () => {
    await render(
      <GroupExpansionProvider>
        <ServiceGrid />
        <SaveProbe />
      </GroupExpansionProvider>
    )
    const next = fixture()
    next.scenes[0].groups[0].name = 'Renamed group'
    await act(async () => save.mutate(next))
    await flush()
    await finishWrite()
    expect(document.body.textContent).toContain('Renamed group')
    expect(document.body.textContent).toContain('First bookmark')
  })
})
