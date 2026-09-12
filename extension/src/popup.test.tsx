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
    let complete!: (value: ReturnType<typeof emptyResolution>) => void
    mocks.requestResolution.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    await act(async () => root.render(<PopupApp />))
    expect(host.textContent).toContain('Add to HarborDeck')
    expect(mocks.writePopupDraft).not.toHaveBeenCalled()
    await act(async () =>
      complete({ ...emptyResolution(settings), activeUrl: settings.primaryUrl })
    )
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
