import type {
  ExtensionLanguage,
  ExtensionSettings,
  OpenMode,
  PopupDraft,
  ResolutionCache,
  ResolutionReason,
  NewTabBootSnapshot,
} from '@extension/types'

const STORAGE_KEY = 'harborDeckNewTabSettings'
const LANGUAGE_STORAGE_KEY = 'harborDeckNewTabLanguage'
const RESOLUTION_CACHE_KEY = 'harborDeckNewTabResolutionCache'
export const NEW_TAB_BOOT_SNAPSHOT_KEY = 'harborDeckNewTabBootSnapshot'
const POPUP_DRAFT_KEY = 'harborDeckPopupDraft'
const POPUP_COLLAPSED_SCENES_KEY = 'harborDeckPopupCollapsedScenes'
const LEGACY_STORAGE_KEY = ['smart', 'Harbor', 'NewTabSettings'].join('')
const LEGACY_LANGUAGE_STORAGE_KEY = ['smart', 'Harbor', 'NewTabLanguage'].join('')
const LEGACY_RESOLUTION_CACHE_KEY = ['smart', 'Harbor', 'NewTabResolutionCache'].join('')

export const MIN_PROBE_TIMEOUT_MS = 50
export const MAX_PROBE_TIMEOUT_MS = 5000
export const DEFAULT_PROBE_TIMEOUT_MS = 200
// Keep the last successful address for a full day. New-tab startup can use it
// immediately, while the background service worker refreshes it asynchronously
// so LAN/WAN changes are picked up without adding launch latency.
export const RESOLUTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000
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

function isCacheReason(value: unknown): value is Exclude<ResolutionReason, 'unconfigured'> {
  return (
    value === 'primary' ||
    value === 'fallback' ||
    value === 'primary-unverified' ||
    value === 'fallback-unverified'
  )
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
  const nextSettings = await readMigratedValue(
    chrome.storage.sync,
    STORAGE_KEY,
    LEGACY_STORAGE_KEY
  )

  if (!isRecord(nextSettings)) {
    return defaultSettings
  }

  return {
    primaryUrl: typeof nextSettings.primaryUrl === 'string' ? nextSettings.primaryUrl : '',
    fallbackUrl: typeof nextSettings.fallbackUrl === 'string' ? nextSettings.fallbackUrl : '',
    apiToken: typeof nextSettings.apiToken === 'string' ? nextSettings.apiToken : '',
    openMode: normalizeOpenMode(nextSettings.openMode),
    probeTimeoutMs: normalizeProbeTimeoutMs(nextSettings.probeTimeoutMs),
  }
}

export async function writeSettings(settings: ExtensionSettings): Promise<void> {
  const normalized: ExtensionSettings = {
    primaryUrl: settings.primaryUrl,
    fallbackUrl: settings.fallbackUrl,
    apiToken: settings.apiToken.trim(),
    openMode: normalizeOpenMode(settings.openMode),
    probeTimeoutMs: normalizeProbeTimeoutMs(settings.probeTimeoutMs),
  }

  await chrome.storage.sync.set({
    [STORAGE_KEY]: normalized,
  })
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

export async function readResolutionCache(): Promise<ResolutionCache | null> {
  const nextCache = await readMigratedValue(
    chrome.storage.local,
    RESOLUTION_CACHE_KEY,
    LEGACY_RESOLUTION_CACHE_KEY
  )

  if (!isRecord(nextCache)) {
    return null
  }

  if (
    typeof nextCache.primaryUrl !== 'string' ||
    typeof nextCache.fallbackUrl !== 'string' ||
    typeof nextCache.activeUrl !== 'string' ||
    !isCacheReason(nextCache.reason) ||
    typeof nextCache.resolvedAt !== 'number' ||
    !Number.isFinite(nextCache.resolvedAt)
  ) {
    return null
  }

  return {
    primaryUrl: nextCache.primaryUrl,
    fallbackUrl: nextCache.fallbackUrl,
    activeUrl: nextCache.activeUrl,
    reason: nextCache.reason,
    resolvedAt: nextCache.resolvedAt,
  }
}

export async function writeResolutionCache(cache: ResolutionCache): Promise<void> {
  await chrome.storage.local.set({
    [RESOLUTION_CACHE_KEY]: cache,
  })
}

export async function clearResolutionCache(): Promise<void> {
  await chrome.storage.local.remove([RESOLUTION_CACHE_KEY, LEGACY_RESOLUTION_CACHE_KEY])
}

export async function writeNewTabBootSnapshot(snapshot: NewTabBootSnapshot): Promise<void> {
  await chrome.storage.local.set({
    [NEW_TAB_BOOT_SNAPSHOT_KEY]: snapshot,
  })
}

export async function clearNewTabBootSnapshot(): Promise<void> {
  await chrome.storage.local.remove(NEW_TAB_BOOT_SNAPSHOT_KEY)
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
    ...(typeof value.recordSceneId === 'string' ? { recordSceneId: value.recordSceneId } : {}),
  }
}

export async function readPopupDraft(): Promise<PopupDraft | null> {
  const stored = await chrome.storage.local.get(POPUP_DRAFT_KEY)
  return normalizePopupDraft(stored[POPUP_DRAFT_KEY])
}

export async function writePopupDraft(draft: PopupDraft): Promise<void> {
  await chrome.storage.local.set({ [POPUP_DRAFT_KEY]: draft })
}

export async function clearPopupDraft(): Promise<void> {
  await chrome.storage.local.set({ [POPUP_DRAFT_KEY]: null })
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
