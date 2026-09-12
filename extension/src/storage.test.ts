import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readSettings,
  readLanguage,
  readResolutionCache,
  readPopupDraft,
  writePopupDraft,
  writeSettings,
  clearPopupDraft,
} from './storage'
import { getInstanceKey } from './resolutionState'
import type { ExtensionSettings, PopupDraft } from './types'
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
  sync = {}
  local = {}
  vi.stubGlobal('chrome', { storage: { sync: area(sync), local: area(local) } })
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
    expect(await readSettings()).toEqual(settings)
    expect(await readLanguage()).toBe('en')
    expect(sync.harborDeckNewTabSettings).toEqual(settings)
  })
  it('assigns a new public settings revision on each save', async () => {
    const first = await writeSettings(settings)
    const second = await writeSettings(first)
    expect(first.settingsRevision).toBeTruthy()
    expect(second.settingsRevision).not.toBe(first.settingsRevision)
    expect(second.apiToken).toBe(settings.apiToken)
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
