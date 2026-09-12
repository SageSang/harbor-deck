import type {
  ExtensionLanguage,
  ExtensionSettings,
  OpenMode,
  PopupDraft,
  ResolutionCache,
  NewTabBootSnapshot,
} from './types'
import { normalizeResolution, VERIFIED_CACHE_TTL_MS } from './resolutionState'
import { normalizeAppSkin, type AppSkin } from '@shared/theme'

export const STORAGE_KEY = 'harborDeckNewTabSettings'
const LANGUAGE_STORAGE_KEY = 'harborDeckNewTabLanguage'
export const RESOLUTION_CACHE_KEY = 'harborDeckNewTabResolutionCache'
export const NEW_TAB_BOOT_SNAPSHOT_KEY = 'harborDeckNewTabBootSnapshot'
const POPUP_DRAFT_KEY = 'harborDeckPopupDraft'
const POPUP_COLLAPSED_SCENES_KEY = 'harborDeckPopupCollapsedScenes'
export const EXTENSION_THEME_STORAGE_KEY = 'harborDeckExtensionTheme'
const LEGACY_STORAGE_KEY = ['smart', 'Harbor', 'NewTabSettings'].join('')
const LEGACY_LANGUAGE_STORAGE_KEY = ['smart', 'Harbor', 'NewTabLanguage'].join('')
const LEGACY_RESOLUTION_CACHE_KEY = ['smart', 'Harbor', 'NewTabResolutionCache'].join('')

export const MIN_PROBE_TIMEOUT_MS = 50
export const MAX_PROBE_TIMEOUT_MS = 5000
export const DEFAULT_PROBE_TIMEOUT_MS = 200
export const RESOLUTION_CACHE_TTL_MS = VERIFIED_CACHE_TTL_MS
export const defaultLanguage = detectPreferredLanguage()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readMigratedValue(
  area: ChromeStorageArea,
  key: string,
  legacyKey: string
): Promise<unknown> {
  const current = await area.get(key)
  if (current[key] !== undefined) {
    return current[key]
  }

  const legacy = await area.get(legacyKey)
  if (legacy[legacyKey] === undefined) {
    return undefined
  }

  await area.set({ [key]: legacy[legacyKey] })
  return legacy[legacyKey]
}

function normalizeOpenMode(value: unknown): OpenMode {
  return value === 'embedded' ? 'embedded' : 'direct'
}

function detectPreferredLanguage(): ExtensionLanguage {
  const locale = globalThis.navigator?.language?.toLowerCase() ?? ''
  return locale.startsWith('zh') ? 'zh-CN' : 'en'
}

function normalizeLanguage(value: unknown): ExtensionLanguage {
  return value === 'en' ? 'en' : 'zh-CN'
}

export function normalizeProbeTimeoutMs(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(numeric)) {
    return DEFAULT_PROBE_TIMEOUT_MS
  }

  return Math.min(MAX_PROBE_TIMEOUT_MS, Math.max(MIN_PROBE_TIMEOUT_MS, Math.round(numeric)))
}

export const defaultSettings: ExtensionSettings = {
  primaryUrl: '',
  fallbackUrl: '',
  apiToken: '',
  openMode: 'direct',
  probeTimeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  const normalized = new URL(withProtocol)

  if (!normalized.pathname) {
    normalized.pathname = '/'
  }

  return normalized.toString()
}

export async function readSettings(): Promise<ExtensionSettings> {
  const nextSettings = await readMigratedValue(chrome.storage.sync, STORAGE_KEY, LEGACY_STORAGE_KEY)

  if (!isRecord(nextSettings)) {
    return defaultSettings
  }

  return {
    primaryUrl: typeof nextSettings.primaryUrl === 'string' ? nextSettings.primaryUrl : '',
    fallbackUrl: typeof nextSettings.fallbackUrl === 'string' ? nextSettings.fallbackUrl : '',
    apiToken: typeof nextSettings.apiToken === 'string' ? nextSettings.apiToken : '',
    openMode: normalizeOpenMode(nextSettings.openMode),
    probeTimeoutMs: normalizeProbeTimeoutMs(nextSettings.probeTimeoutMs),
    ...(typeof nextSettings.settingsRevision === 'string'
      ? { settingsRevision: nextSettings.settingsRevision }
      : {}),
  }
}

export async function writeSettings(settings: ExtensionSettings): Promise<ExtensionSettings> {
  const normalized: ExtensionSettings = {
    primaryUrl: normalizeUrl(settings.primaryUrl),
    fallbackUrl: normalizeUrl(settings.fallbackUrl),
    settingsRevision: crypto.randomUUID(),
    apiToken: settings.apiToken.trim(),
    openMode: normalizeOpenMode(settings.openMode),
    probeTimeoutMs: normalizeProbeTimeoutMs(settings.probeTimeoutMs),
  }

  await chrome.storage.sync.set({
    [STORAGE_KEY]: normalized,
  })
  return normalized
}

export async function readLanguage(): Promise<ExtensionLanguage> {
  const stored = await readMigratedValue(
    chrome.storage.sync,
    LANGUAGE_STORAGE_KEY,
    LEGACY_LANGUAGE_STORAGE_KEY
  )
  return normalizeLanguage(stored ?? defaultLanguage)
}

export async function writeLanguage(language: ExtensionLanguage): Promise<void> {
  await chrome.storage.sync.set({
    [LANGUAGE_STORAGE_KEY]: normalizeLanguage(language),
  })
}

export async function readExtensionTheme(): Promise<AppSkin> {
  const stored = await chrome.storage.local.get(EXTENSION_THEME_STORAGE_KEY)
  return normalizeAppSkin(stored[EXTENSION_THEME_STORAGE_KEY])
}

export async function writeExtensionTheme(skin: AppSkin): Promise<void> {
  await chrome.storage.local.set({
    [EXTENSION_THEME_STORAGE_KEY]: skin,
  })
}

export async function readResolutionCache(): Promise<ResolutionCache | null> {
  const stored = await chrome.storage.local.get(NEW_TAB_BOOT_SNAPSHOT_KEY)
  const snapshot = normalizeResolution(stored[NEW_TAB_BOOT_SNAPSHOT_KEY])
  if (snapshot) return snapshot
  const current = await chrome.storage.local.get(RESOLUTION_CACHE_KEY)
  if (current[RESOLUTION_CACHE_KEY] !== undefined)
    return normalizeResolution(current[RESOLUTION_CACHE_KEY])
  const legacy = await chrome.storage.local.get(LEGACY_RESOLUTION_CACHE_KEY)
  return normalizeResolution(legacy[LEGACY_RESOLUTION_CACHE_KEY])
}

/** Only the background coordinator commits resolution state. */
export async function writeResolutionSnapshot(snapshot: NewTabBootSnapshot): Promise<void> {
  await chrome.storage.local.set({
    [RESOLUTION_CACHE_KEY]: snapshot,
    [NEW_TAB_BOOT_SNAPSHOT_KEY]: snapshot,
  })
}

function normalizePopupDraft(value: unknown): PopupDraft | null {
  if (!isRecord(value) || typeof value.tabUrl !== 'string' || typeof value.tabTitle !== 'string') {
    return null
  }

  const selectedGroups: Record<string, string> = {}
  if (isRecord(value.selectedGroups)) {
    Object.entries(value.selectedGroups).forEach(([sceneId, groupId]) => {
      if (typeof groupId === 'string') {
        selectedGroups[sceneId] = groupId
      }
    })
  }

  return {
    // Drafts written before sourceTabUrl was introduced were keyed by the
    // editable URL. Treat that value as the source for a best-effort upgrade.
    sourceTabUrl: typeof value.sourceTabUrl === 'string' ? value.sourceTabUrl : value.tabUrl,
    tabUrl: value.tabUrl,
    tabTitle: value.tabTitle,
    secondaryUrl: typeof value.secondaryUrl === 'string' ? value.secondaryUrl : '',
    note: typeof value.note === 'string' ? value.note : '',
    selectedGroups,
    ...(typeof value.instanceKey === 'string' ? { instanceKey: value.instanceKey } : {}),
    ...(isRecord(value.pendingSubmission)
      ? { pendingSubmission: value.pendingSubmission as unknown as PopupDraft['pendingSubmission'] }
      : {}),
    ...(typeof value.recordSceneId === 'string' ? { recordSceneId: value.recordSceneId } : {}),
    ...(typeof value.existingBookmarkSlug === 'string'
      ? { existingBookmarkSlug: value.existingBookmarkSlug }
      : {}),
  }
}

const POPUP_DRAFTS_KEY = 'harborDeckPopupDrafts'
let draftWrites: Promise<void> = Promise.resolve()
function draftKey(instanceKey: string, sourceTabUrl: string) {
  return JSON.stringify([instanceKey, sourceTabUrl])
}

export async function readPopupDraft(
  instanceKey?: string,
  sourceTabUrl?: string
): Promise<PopupDraft | null> {
  if (instanceKey && sourceTabUrl) {
    const stored = await chrome.storage.local.get(POPUP_DRAFTS_KEY)
    const drafts = stored[POPUP_DRAFTS_KEY]
    if (isRecord(drafts)) {
      const matching = normalizePopupDraft(drafts[draftKey(instanceKey, sourceTabUrl)])
      if (matching) return matching
    }
  }
  const stored = await chrome.storage.local.get(POPUP_DRAFT_KEY)
  const legacy = normalizePopupDraft(stored[POPUP_DRAFT_KEY])
  return legacy && (!legacy.instanceKey || !instanceKey || legacy.instanceKey === instanceKey)
    ? legacy
    : null
}

export function writePopupDraft(draft: PopupDraft): Promise<void> {
  draftWrites = draftWrites
    .catch(() => undefined)
    .then(async () => {
      if (!draft.instanceKey) {
        await chrome.storage.local.set({ [POPUP_DRAFT_KEY]: draft })
        return
      }
      const stored = await chrome.storage.local.get(POPUP_DRAFTS_KEY)
      const drafts = isRecord(stored[POPUP_DRAFTS_KEY]) ? stored[POPUP_DRAFTS_KEY] : {}
      await chrome.storage.local.set({
        [POPUP_DRAFTS_KEY]: {
          ...drafts,
          [draftKey(draft.instanceKey, draft.sourceTabUrl)]: draft,
        },
      })
    })
  return draftWrites
}

export function clearPopupDraft(instanceKey?: string, sourceTabUrl?: string): Promise<void> {
  draftWrites = draftWrites
    .catch(() => undefined)
    .then(async () => {
      if (instanceKey && sourceTabUrl) {
        const stored = await chrome.storage.local.get(POPUP_DRAFTS_KEY)
        const drafts = isRecord(stored[POPUP_DRAFTS_KEY]) ? { ...stored[POPUP_DRAFTS_KEY] } : {}
        delete drafts[draftKey(instanceKey, sourceTabUrl)]
        await chrome.storage.local.set({ [POPUP_DRAFTS_KEY]: drafts })
      }
      const stored = await chrome.storage.local.get(POPUP_DRAFT_KEY)
      const legacy = normalizePopupDraft(stored[POPUP_DRAFT_KEY])
      if (
        !sourceTabUrl ||
        (legacy?.sourceTabUrl === sourceTabUrl &&
          (!legacy.instanceKey || legacy.instanceKey === instanceKey))
      ) {
        await chrome.storage.local.set({ [POPUP_DRAFT_KEY]: null })
      }
    })
  return draftWrites
}

export async function readPopupCollapsedSceneIds(): Promise<string[]> {
  const stored = await chrome.storage.local.get(POPUP_COLLAPSED_SCENES_KEY)
  const value = stored[POPUP_COLLAPSED_SCENES_KEY]
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : []
}

export async function writePopupCollapsedSceneIds(sceneIds: Iterable<string>): Promise<void> {
  await chrome.storage.local.set({
    [POPUP_COLLAPSED_SCENES_KEY]: Array.from(new Set(sceneIds)),
  })
}
