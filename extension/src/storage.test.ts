import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readSettings,
  effectiveOpenMode,
  readLanguage,
  readResolutionCache,
  readPopupDraft,
  writePopupDraft,
  writeSettings,
  clearPopupDraft,
} from './storage'
import { getInstanceKey } from './resolutionState'
import type { ExtensionSettings, PopupDraft } from './types'
import { createSettingsCoordinator } from './settingsCoordinator'
let sync: Record<string, unknown>
let local: Record<string, unknown>
const area = (values: Record<string, unknown>) => ({
  get: vi.fn(async (key: string) => ({ [key]: values[key] })),
  set: vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(values, items)
  }),
  remove: vi.fn(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]
  }),
})
beforeEach(() => {
  let lock: Promise<unknown> = Promise.resolve()
  vi.stubGlobal('navigator', {
    language: 'en',
    locks: {
      request: (_name: string, work: () => Promise<unknown>) => {
        const next = lock.catch(() => undefined).then(work)
        lock = next
        return next
      },
    },
  })
  sync = {}
  local = {}
  const worker = createSettingsCoordinator()
  vi.stubGlobal('chrome', {
    storage: { sync: area(sync), local: area(local) },
    runtime: {
      sendMessage: vi.fn(async (request) => ({
        ok: true,
        settings:
          request.operation === 'save' ? await worker.save(request.settings) : await worker.read(),
      })),
    },
  })
})
afterEach(() => vi.unstubAllGlobals())
const settings: ExtensionSettings = {
  primaryUrl: 'http://lan.test/',
  fallbackUrl: '',
  apiToken: 'old-token',
  openMode: 'embedded',
  probeTimeoutMs: 500,
}
const draft: PopupDraft = {
  sourceTabUrl: 'https://bookmark.test/',
  tabUrl: 'https://edited.test/',
  tabTitle: 'Actual unfinished draft',
  note: 'Keep this note',
  secondaryUrl: '',
  selectedGroups: { work: 'manual-group' },
}
describe('extension settings and real draft compatibility', () => {
  it('preserves old smartHarbor settings, token, language and embedded mode', async () => {
    sync.smartHarborNewTabSettings = settings
    sync.smartHarborNewTabLanguage = 'en'
    expect(await readSettings()).toMatchObject(settings)
    expect(await readLanguage()).toBe('en')
    expect(local.harborDeckNewTabSettings).toMatchObject(settings)
    expect(sync.harborDeckNewTabSettings).toBeUndefined()
    expect(sync.smartHarborNewTabSettings).toEqual(settings)
  })
  it('assigns a new public settings revision on each save', async () => {
    const first = await writeSettings(settings)
    const second = await writeSettings(first)
    expect(first.settingsRevision).toBeTruthy()
    expect(second.settingsRevision).not.toBe(first.settingsRevision)
    expect(second.apiToken).toBe(settings.apiToken)
    expect(sync.harborDeckNewTabSettings).toBeUndefined()
  })
  it('imports once and ignores later connection settings from another synced device', async () => {
    sync.harborDeckNewTabSettings = settings
    const first = await readSettings()
    sync.harborDeckNewTabSettings = { ...settings, primaryUrl: 'https://other-device.test/' }
    expect(await readSettings()).toEqual(first)
    await writeSettings({ ...first, primaryUrl: 'https://this-device.test/' })
    expect(sync.harborDeckNewTabSettings).toMatchObject({
      primaryUrl: 'https://other-device.test/',
    })
  })
  it('does not import late sync values into an installation initialized with empty settings', async () => {
    expect((await readSettings()).primaryUrl).toBe('')
    sync.harborDeckNewTabSettings = settings
    expect((await readSettings()).primaryUrl).toBe('')
  })
  it('serializes migration before a concurrent save, and never overwrites the saved value', async () => {
    let finish!: (value: Record<string, unknown>) => void
    vi.mocked(chrome.storage.sync.get).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const loading = readSettings()
    for (let i = 0; i < 10; i++) await Promise.resolve()
    const saving = writeSettings({ ...settings, primaryUrl: 'https://edited.test/' })
    finish({ harborDeckNewTabSettings: settings })
    await Promise.all([loading, saving])
    expect((await readSettings()).primaryUrl).toBe('https://edited.test/')
  })
  it('recovers after a failed migration without touching the original sync settings', async () => {
    sync.harborDeckNewTabSettings = settings
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('storage unavailable'))
    await expect(readSettings()).rejects.toThrow('storage unavailable')
    expect(sync.harborDeckNewTabSettings).toEqual(settings)
    expect(await readSettings()).toMatchObject(settings)
  })
  it('keeps legacy cache as an unverified address hint', async () => {
    local.smartHarborNewTabResolutionCache = {
      primaryUrl: settings.primaryUrl,
      fallbackUrl: '',
      activeUrl: settings.primaryUrl,
      reason: 'primary',
      resolvedAt: Date.now(),
    }
    expect(await readResolutionCache()).toMatchObject({
      activeUrl: settings.primaryUrl,
      status: 'unverified',
      verifiedAt: null,
    })
  })
  it('preserves a real legacy draft and independently stores drafts for different server instances', async () => {
    local.harborDeckPopupDraft = draft
    expect(await readPopupDraft()).toEqual(draft)
    const instanceA = getInstanceKey(settings)
    const instanceB = getInstanceKey({ ...settings, primaryUrl: 'https://another.test/' })
    await writePopupDraft({ ...draft, instanceKey: instanceA })
    await writePopupDraft({ ...draft, instanceKey: instanceB, tabTitle: 'Other server draft' })
    expect((await readPopupDraft(instanceA, draft.sourceTabUrl))?.tabTitle).toBe(draft.tabTitle)
    expect((await readPopupDraft(instanceB, draft.sourceTabUrl))?.tabTitle).toBe(
      'Other server draft'
    )
    await clearPopupDraft(instanceB, draft.sourceTabUrl)
    expect((await readPopupDraft(instanceA, draft.sourceTabUrl))?.selectedGroups).toEqual(
      draft.selectedGroups
    )
  })
})

it.each([
  { mode: 'direct' as const, version: undefined, expected: 'local' },
  { mode: 'embedded' as const, version: undefined, expected: 'local' },
  { mode: 'local' as const, version: 1 as const, expected: 'local' },
  { mode: 'direct' as const, version: 1 as const, expected: 'direct' },
])(
  'saves the displayed $expected choice when only the timeout changes from $mode / $version',
  async ({ mode, version, expected }) => {
    const before: ExtensionSettings = {
      primaryUrl: 'https://deck.test/',
      fallbackUrl: '',
      apiToken: 'keep-token',
      probeTimeoutMs: 200,
      openMode: mode,
      localExperienceVersion: version,
    }
    const selected = effectiveOpenMode(before)
    expect(selected).toBe(expected)
    const saved = await writeSettings({
      ...before,
      openMode: selected,
      localExperienceVersion: 1,
      probeTimeoutMs: 1000,
    })
    expect(saved.openMode).toBe(expected)
    expect(effectiveOpenMode(saved)).toBe(expected)
    expect(saved.apiToken).toBe(before.apiToken)
    expect(saved.primaryUrl).toBe(before.primaryUrl)
    expect(saved.probeTimeoutMs).toBe(1000)
  }
)
