import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PopupApp } from './popup'
import { emptyResolution, getInstanceKey } from './resolutionState'
import type { ExtensionSettings } from './types'
import { IntegrationNetworkError } from './integrationClient'
const mocks = vi.hoisted(() => ({
  readSettings: vi.fn(),
  readLanguage: vi.fn(),
  readPopupDraft: vi.fn(),
  writePopupDraft: vi.fn(),
  clearPopupDraft: vi.fn(),
  requestResolution: vi.fn(),
  getIntegrationJson: vi.fn(),
  integrationRequest: vi.fn(),
}))
vi.mock('./storage', () => mocks)
vi.mock('./resolutionClient', () => mocks)
vi.mock('./theme', () => ({ restoreExtensionTheme: vi.fn().mockResolvedValue('midnight') }))
vi.mock('./integrationClient', async (original) => ({
  ...(await original<typeof import('./integrationClient')>()),
  getIntegrationJson: mocks.getIntegrationJson,
  integrationRequest: mocks.integrationRequest,
  integrationTarget: () => settings.primaryUrl,
}))
const settings: ExtensionSettings = {
  primaryUrl: 'https://deck.test/',
  fallbackUrl: '',
  apiToken: 'token',
  openMode: 'direct',
  probeTimeoutMs: 200,
  settingsRevision: 'v1',
}
const existing = {
  bookmark: {
    slug: 'saved',
    name: 'Saved bookmark',
    primaryUrl: 'https://bookmark.test/',
    note: 'Original note',
  },
  placements: [{ sceneId: 'home', groupId: 'g' }],
}
const sceneList = {
  defaultSceneId: 'home',
  scenes: [{ id: 'home', name: 'Home', groups: [{ id: 'g', name: 'Group' }] }],
}
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('chrome', {
    tabs: {
      query: vi.fn().mockResolvedValue([{ url: 'https://bookmark.test/', title: 'Page title' }]),
    },
    runtime: { openOptionsPage: vi.fn() },
  })
  mocks.readSettings.mockResolvedValue(settings)
  mocks.readLanguage.mockResolvedValue('en')
  mocks.readPopupDraft.mockResolvedValue(null)
  mocks.writePopupDraft.mockResolvedValue(undefined)
  mocks.clearPopupDraft.mockResolvedValue(undefined)
  mocks.requestResolution.mockResolvedValue({
    ...emptyResolution(settings),
    activeUrl: settings.primaryUrl,
  })
  mocks.getIntegrationJson.mockImplementation(async (_settings, path: string) =>
    path.includes('/scenes') ? sceneList : existing
  )
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
describe('popup initialization and uncertain writes', () => {
  it('loads English once, waits for lookup, and never saves initialization as a draft', async () => {
    let complete!: (value: typeof sceneList) => void
    mocks.getIntegrationJson.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    await act(async () => root.render(<PopupApp />))
    expect(host.textContent).toContain('Add to HarborDeck')
    expect(mocks.writePopupDraft).not.toHaveBeenCalled()
    await act(async () => complete(sceneList))
    expect(mocks.readSettings).toHaveBeenCalledTimes(1)
    expect((host.querySelector('input') as HTMLInputElement).value).toBe('Saved bookmark')
    expect(host.querySelector('button[type="submit"]')?.textContent).toBe('Save Changes')
    expect(mocks.writePopupDraft).not.toHaveBeenCalled()
  })
  it('does not let delayed lookup overwrite user input made during initialization', async () => {
    let complete!: (value: typeof existing) => void
    mocks.getIntegrationJson.mockImplementation(async (_settings, path: string) =>
      path.includes('/scenes')
        ? sceneList
        : new Promise((resolve) => {
            complete = resolve
          })
    )
    await act(async () => root.render(<PopupApp />))
    const input = host.querySelector('input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'My unfinished title'
      )
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(mocks.writePopupDraft).toHaveBeenCalledWith(
      expect.objectContaining({ tabTitle: 'My unfinished title' })
    )
    await act(async () => complete(existing))
    expect(input.value).toBe('My unfinished title')
    expect(mocks.writePopupDraft).toHaveBeenCalledWith(
      expect.objectContaining({ tabTitle: 'My unfinished title' })
    )
  })
  it('keeps editing disabled during a slow POST and the confirmed-save closing window', async () => {
    let finish!: (value: unknown) => void
    mocks.integrationRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    await act(async () => root.render(<PopupApp />))
    await act(async () =>
      host
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    )
    expect(host.querySelector('fieldset')?.disabled).toBe(true)
    expect(host.querySelector('input')?.matches(':disabled')).toBe(true)
    await act(async () => finish({ created: false }))
    expect(mocks.clearPopupDraft).toHaveBeenCalledOnce()
    expect(host.querySelector('input')?.matches(':disabled')).toBe(true)
    await act(async () =>
      host
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    )
    expect(mocks.integrationRequest).toHaveBeenCalledTimes(1)
  })

  it('restores an actual instance draft and keeps an uncertain POST for read-only verification', async () => {
    mocks.readPopupDraft.mockResolvedValue({
      sourceTabUrl: 'https://bookmark.test/',
      tabUrl: 'https://bookmark.test/',
      tabTitle: 'Draft title',
      note: 'My note',
      secondaryUrl: '',
      selectedGroups: { home: 'g' },
      recordSceneId: 'home',
      instanceKey: getInstanceKey(settings),
    })
    mocks.integrationRequest.mockRejectedValue(new IntegrationNetworkError())
    await act(async () => root.render(<PopupApp />))
    expect((host.querySelector('input') as HTMLInputElement).value).toBe('Draft title')
    await act(async () =>
      host
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    )
    expect(mocks.integrationRequest).toHaveBeenCalledTimes(1)
    expect(mocks.getIntegrationJson).toHaveBeenCalledWith(
      settings,
      expect.stringContaining('/lookup?')
    )
    expect(mocks.clearPopupDraft).not.toHaveBeenCalled()
    expect(mocks.writePopupDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingSubmission: expect.objectContaining({ name: 'Draft title' }),
      })
    )
    expect(host.textContent).toContain('will not be resubmitted automatically')
  })
})

const manyScenes = {
  defaultSceneId: 'home',
  scenes: [
    {
      id: 'home',
      name: 'Home',
      groups: [
        { id: 'g', name: '账号｜邮箱' },
        { id: 'tools', name: '开发｜工具' },
      ],
    },
    { id: 'work', name: 'Dewu', groups: [{ id: 'tests', name: '测试｜平台' }] },
  ],
}
async function setInput(selector: string, value: string) {
  await act(async () => {
    const el = host.querySelector<HTMLInputElement>(selector)!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function submit() {
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  )
}
function draft(selectedGroups: Record<string, string>, recordSceneId = 'home') {
  return {
    sourceTabUrl: 'https://bookmark.test/',
    tabUrl: 'https://bookmark.test/',
    tabTitle: 'Draft title',
    note: 'Keep this text',
    secondaryUrl: '',
    selectedGroups,
    recordSceneId,
    instanceKey: getInstanceKey(settings),
  }
}
describe('searchable save locations and preserved intent', () => {
  it('keeps multi-scene choices across filtering and submits their exact IDs', async () => {
    mocks.getIntegrationJson.mockImplementation(async (_settings, path: string) =>
      path.includes('/scenes') ? manyScenes : existing
    )
    mocks.integrationRequest.mockResolvedValue({ created: false })
    await act(async () => root.render(<PopupApp />))
    await setInput('input[type="search"]', 'Dewu 测试')
    await act(async () => host.querySelector<HTMLButtonElement>('[data-category-option]')!.click())
    await setInput('input[type="search"]', 'does-not-exist')
    expect(host.querySelectorAll('.selected-location')).toHaveLength(2)
    await submit()
    expect(mocks.integrationRequest).toHaveBeenCalledWith(
      settings.primaryUrl,
      '/api/integrations/bookmarks',
      settings,
      expect.objectContaining({
        body: expect.objectContaining({
          placements: [
            { sceneId: 'home', groupId: 'g' },
            { sceneId: 'work', groupId: 'tests' },
          ],
        }),
      })
    )
  })
  it('replaces only the selected group in the same scene', async () => {
    mocks.readPopupDraft.mockResolvedValue(draft({ home: 'g', work: 'tests' }))
    mocks.getIntegrationJson.mockResolvedValue(manyScenes)
    await act(async () => root.render(<PopupApp />))
    await setInput('input[type="search"]', 'Home 工具')
    await act(async () => host.querySelector<HTMLButtonElement>('[data-category-option]')!.click())
    expect(mocks.writePopupDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedGroups: { home: 'tools', work: 'tests' } })
    )
  })
  it('does not change the quick-record target just by browsing or searching', async () => {
    mocks.getIntegrationJson.mockImplementation(async (_settings, path: string) =>
      path.includes('/scenes') ? manyScenes : {}
    )
    await act(async () => root.render(<PopupApp />))
    await act(async () =>
      host.querySelectorAll<HTMLButtonElement>('.popup-scene-heading')[1].click()
    )
    await setInput('input[type="search"]', 'Dewu')
    expect(host.querySelector('select')?.value).toBe('home')
    expect(host.querySelector('button[type="submit"]')?.textContent).toContain('Home')
    expect(mocks.writePopupDraft).not.toHaveBeenCalled()
  })
  it('saves quick records only to the explicitly selected scene', async () => {
    mocks.getIntegrationJson.mockImplementation(async (_settings, path: string) =>
      path.includes('/scenes') ? manyScenes : {}
    )
    mocks.integrationRequest.mockResolvedValue({ created: true })
    await act(async () => root.render(<PopupApp />))
    await act(async () => {
      const select = host.querySelector('select')!
      select.value = 'work'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await submit()
    expect(mocks.integrationRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      settings,
      expect.objectContaining({
        body: expect.objectContaining({ recordSceneId: 'work', placements: [] }),
      })
    )
  })
  it('blocks a deleted category without silently losing its draft target or text', async () => {
    mocks.readPopupDraft.mockResolvedValue(draft({ home: 'removed' }))
    mocks.getIntegrationJson.mockResolvedValue(manyScenes)
    await act(async () => root.render(<PopupApp />))
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.querySelector('input')?.value).toBe('Draft title')
    expect(host.querySelector('textarea')?.value).toBe('Keep this text')
    expect(host.querySelector('details')?.open).toBe(true)
    await submit()
    expect(mocks.integrationRequest).not.toHaveBeenCalled()
    expect(mocks.writePopupDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedGroups: { home: 'removed' } })
    )
    await setInput('input[type="search"]', 'Home 邮箱')
    await act(async () => host.querySelector<HTMLButtonElement>('[data-category-option]')!.click())
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false)
  })
  it('persists a missing quick-record scene until the user explicitly chooses a replacement', async () => {
    mocks.readPopupDraft.mockResolvedValue(draft({}, 'removed-scene'))
    mocks.getIntegrationJson.mockResolvedValue(manyScenes)
    await act(async () => root.render(<PopupApp />))
    expect(host.querySelector('select')?.value).toBe('')
    await setInput('input:not([type="search"])', 'Updated title')
    expect(mocks.writePopupDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ recordSceneId: 'removed-scene' })
    )
    await submit()
    expect(mocks.integrationRequest).not.toHaveBeenCalled()
  })
  it('keeps unconfirmed submissions blocked even after changing the visible selection', async () => {
    mocks.readPopupDraft.mockResolvedValue({
      ...draft({ home: 'g' }),
      pendingSubmission: {
        name: 'Draft title',
        primaryUrl: 'https://bookmark.test/',
        placements: [{ sceneId: 'home', groupId: 'g' }],
      },
    })
    mocks.getIntegrationJson.mockResolvedValue(manyScenes)
    await act(async () => root.render(<PopupApp />))
    await setInput('input[type="search"]', 'Home 工具')
    await act(async () => host.querySelector<HTMLButtonElement>('[data-category-option]')!.click())
    await submit()
    expect(mocks.integrationRequest).not.toHaveBeenCalled()
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
  })
  it('Enter in category search selects a location without sending a bookmark', async () => {
    mocks.getIntegrationJson.mockImplementation(async (_settings, path: string) =>
      path.includes('/scenes') ? manyScenes : {}
    )
    await act(async () => root.render(<PopupApp />))
    await setInput('input[type="search"]', 'Dewu 测试')
    await act(async () =>
      host
        .querySelector('input[type="search"]')!
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
        )
    )
    expect(host.querySelectorAll('.selected-location')).toHaveLength(1)
    expect(mocks.integrationRequest).not.toHaveBeenCalled()
  })
})

it('resumes editing only after explicit review, without replaying an uncertain POST', async () => {
  mocks.readPopupDraft.mockResolvedValue({
    ...draft({ home: 'g' }),
    pendingSubmission: {
      name: 'Draft title',
      primaryUrl: 'https://bookmark.test/',
      placements: [{ sceneId: 'home', groupId: 'g' }],
    },
  })
  mocks.getIntegrationJson.mockImplementation(async (_settings, path: string) =>
    path.includes('/scenes') ? manyScenes : { bookmark: null, placements: [] }
  )
  await act(async () => root.render(<PopupApp />))
  expect(host.textContent).not.toContain('Reviewed, resume editing')
  const button = [...host.querySelectorAll('button')].find(
    (el) => el.textContent === 'Check save result'
  )!
  await act(async () => button.click())
  const resume = [...host.querySelectorAll('button')].find(
    (el) => el.textContent === 'Reviewed, resume editing'
  )!
  expect(resume).toBeDefined()
  await act(async () => resume.click())
  expect(mocks.integrationRequest).not.toHaveBeenCalled()
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false)
  expect(mocks.writePopupDraft.mock.calls.at(-1)?.[0].pendingSubmission).toBeUndefined()
})
