import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createSettingsCoordinator } from './settingsCoordinator'
import { createTransferService, parseTransfer } from './transfer'
import { writePopupDraft } from './storage'
import type { PopupDraft } from './types'

let local: Record<string, unknown>
let sync: Record<string, unknown>
let connections: ReturnType<typeof createSettingsCoordinator>
let service: ReturnType<typeof createTransferService>
const draft: PopupDraft = {
  sourceTabUrl: 'https://source.test/',
  tabUrl: 'https://edited.test/',
  tabTitle: 'Unfinished title',
  secondaryUrl: 'https://alternate.test/',
  note: 'Keep this note',
  selectedGroups: { work: 'group' },
  instanceKey: '["http://lan.test/","https://wan.test/"]',
  recordSceneId: 'record',
  pendingSubmission: {
    name: 'Waiting for confirmation',
    primaryUrl: 'https://edited.test/',
    note: 'Do not resubmit',
    placements: [{ sceneId: 'work', groupId: 'group' }],
  },
}
const draftKey = JSON.stringify([draft.instanceKey, draft.sourceTabUrl])
const file = () => ({
  format: 'harbordeck-extension-transfer',
  version: 1,
  sourceExtensionId: 'a'.repeat(32),
  exportedAt: '2026-09-26T00:00:00.000Z',
  tokenOmitted: true,
  settings: {
    primaryUrl: 'http://lan.test/',
    fallbackUrl: 'https://wan.test/',
    openMode: 'embedded',
    probeTimeoutMs: 900,
  },
  language: 'zh-CN',
  local: {
    legacyDraft: null,
    drafts: { [draftKey]: draft },
    collapsedScenes: ['work'],
    theme: 'ember',
  },
})
const area = (values: Record<string, unknown>) => ({
  get: vi.fn(async (keys: string | string[]) =>
    Object.fromEntries(
      (Array.isArray(keys) ? keys : [keys]).map((key) => [key, structuredClone(values[key])])
    )
  ),
  set: vi.fn(async (valuesToSet: Record<string, unknown>) => {
    Object.assign(values, structuredClone(valuesToSet))
  }),
  remove: vi.fn(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]
  }),
})
beforeEach(() => {
  local = {}
  sync = {}
  let lock: Promise<unknown> = Promise.resolve()
  vi.stubGlobal('navigator', {
    language: 'en',
    locks: {
      request: (_key: string, work: () => Promise<unknown>) => {
        const next = lock.catch(() => undefined).then(work)
        lock = next
        return next
      },
    },
  })
  vi.stubGlobal('chrome', {
    runtime: { id: 'a'.repeat(32) },
    storage: { local: area(local), sync: area(sync) },
  })
  vi.stubGlobal('fetch', vi.fn())
  connections = createSettingsCoordinator()
  service = createTransferService(connections)
})
afterEach(() => vi.unstubAllGlobals())

describe('one-time extension data transfer', () => {
  it('round-trips saved settings and all draft fields without a token or cache, and never submits bookmarks', async () => {
    const input = file()
    local.harborDeckNewTabSettings = {
      ...input.settings,
      apiToken: 'private-fixture-token',
      settingsRevision: 'old',
    }
    local.harborDeckPopupDrafts = input.local.drafts
    local.harborDeckPopupDraft = { ...draft, instanceKey: undefined }
    local.harborDeckExtensionTheme = 'ember'
    local.harborDeckPopupCollapsedScenes = ['work']
    local.harborDeckNewTabBootSnapshot = { activeUrl: 'https://old-network.test/' }
    sync.harborDeckNewTabLanguage = 'zh-CN'
    const text = await service.export()
    expect(text).not.toContain('private-fixture-token')
    expect(text).not.toContain('old-network')
    for (const key of Object.keys(local)) delete local[key]
    const result = await service.import(text)
    expect(result).toMatchObject({ draftCount: 2, tokenOmitted: true, languageApplied: true })
    expect(local.harborDeckNewTabSettings).toMatchObject({ ...input.settings, apiToken: '' })
    expect(local.harborDeckPopupDrafts).toEqual(input.local.drafts)
    expect(local.harborDeckPopupDraft).toEqual({ ...draft, instanceKey: undefined })
    expect(local.harborDeckNewTabBootSnapshot).toBeNull()
    expect(sync.harborDeckNewTabLanguage).toBe('zh-CN')
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['settings', 'drafts', 'theme', 'mode'])(
    'refuses an occupied target (%s) without overwriting it',
    async (kind) => {
      await connections.read()
      if (kind === 'settings')
        await connections.save({
          primaryUrl: 'https://existing.test/',
          fallbackUrl: '',
          apiToken: '',
          openMode: 'direct',
          probeTimeoutMs: 200,
        })
      else if (kind === 'drafts') local.harborDeckPopupDrafts = { [draftKey]: draft }
      else if (kind === 'theme') local.harborDeckExtensionTheme = 'frost'
      else
        local.harborDeckNewTabSettings = {
          ...(local.harborDeckNewTabSettings as object),
          openMode: 'embedded',
        }
      const before = structuredClone(local)
      await expect(service.import(JSON.stringify(file()))).rejects.toThrow('target-not-empty')
      expect(local).toEqual(before)
    }
  )

  it.each(['version', 'url', 'token', 'draft-key', 'pending-request'])(
    'rejects invalid %s data before any local mutation',
    async (kind) => {
      const value = file()
      if (kind === 'version') value.version = 2
      else if (kind === 'url') value.settings.primaryUrl = 'javascript:alert(1)'
      else if (kind === 'token') Object.assign(value.settings, { apiToken: 'must-not-import' })
      else if (kind === 'draft-key') value.local.drafts = { wrong: draft }
      else
        value.local.drafts[draftKey] = {
          ...draft,
          pendingSubmission: { ...draft.pendingSubmission!, placements: null as unknown as [] },
        }
      await expect(service.import(JSON.stringify(value))).rejects.toThrow('invalid-transfer')
      expect(local).toEqual({})
    }
  )

  it('reports language sync failure separately after durable data was imported', async () => {
    vi.mocked(chrome.storage.sync.set).mockRejectedValueOnce(new Error('sync unavailable'))
    const result = await service.import(JSON.stringify(file()))
    expect(result.languageApplied).toBe(false)
    expect(local.harborDeckPopupDrafts).toEqual(file().local.drafts)
  })

  it('preserves the blank target when its import write fails and allows a later retry', async () => {
    await connections.read()
    const before = structuredClone(local)
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('disk unavailable'))
    await expect(service.import(JSON.stringify(file()))).rejects.toThrow('disk unavailable')
    expect(local).toEqual(before)
    await expect(service.import(JSON.stringify(file()))).resolves.toMatchObject({ draftCount: 1 })
  })

  it('does not clobber a draft being saved from another extension page', async () => {
    await connections.read()
    const saving = writePopupDraft(draft)
    const importing = service.import(JSON.stringify(file()))
    await saving
    await expect(importing).rejects.toThrow('target-not-empty')
    expect(local.harborDeckPopupDrafts).toEqual({ [draftKey]: draft })
  })

  it('accepts the read-only exporter run in an old extension, including legacy keys', async () => {
    sync.smartHarborNewTabSettings = { ...file().settings, apiToken: 'never-export-this' }
    sync.smartHarborNewTabLanguage = 'en'
    local.harborDeckPopupDrafts = file().local.drafts
    let captured: Blob | undefined
    const before = structuredClone({ sync, local })
    const script = readFileSync('extension/tools/export-legacy-settings.js', 'utf8')
    await runInNewContext(script, {
      chrome,
      location: { protocol: 'chrome-extension:' },
      navigator: { language: 'en' },
      Blob: globalThis.Blob,
      URL: {
        createObjectURL: (blob: Blob) => {
          captured = blob
          return 'blob:test'
        },
        revokeObjectURL: vi.fn(),
      },
      document: { createElement: () => ({ click: vi.fn() }) },
      setTimeout: vi.fn(),
      console: { info: vi.fn() },
    })
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsText(captured!)
    })
    expect(parseTransfer(text).local.drafts).toEqual(file().local.drafts)
    expect(text).not.toContain('never-export-this')
    expect({ sync, local }).toEqual(before)
  })
})
