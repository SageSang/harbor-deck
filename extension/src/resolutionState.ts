import type {
  ExtensionSettings,
  NewTabBootSnapshot,
  ResolutionReason,
  ResolutionStatus,
} from './types'

export const RESOLUTION_SCHEMA_VERSION = 2
export const VERIFIED_CACHE_TTL_MS = 30_000
export const MANUAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000
export const CACHED_REDIRECT_GRACE_MS = 120
export const UNCACHED_REDIRECT_GRACE_MS = 180

export function settingsRevision(settings: ExtensionSettings) {
  return settings.settingsRevision ?? 'legacy'
}

export function matchesSettings(
  snapshot: NewTabBootSnapshot | null,
  settings: ExtensionSettings
): snapshot is NewTabBootSnapshot {
  return Boolean(
    snapshot &&
    snapshot.settingsRevision === settingsRevision(settings) &&
    snapshot.primaryUrl === settings.primaryUrl &&
    snapshot.fallbackUrl === settings.fallbackUrl &&
    snapshot.openMode === settings.openMode &&
    snapshot.probeTimeoutMs === settings.probeTimeoutMs
  )
}

export function sameSettings(left: ExtensionSettings, right: ExtensionSettings) {
  return (
    settingsRevision(left) === settingsRevision(right) &&
    left.primaryUrl === right.primaryUrl &&
    left.fallbackUrl === right.fallbackUrl &&
    left.openMode === right.openMode &&
    left.probeTimeoutMs === right.probeTimeoutMs &&
    left.apiToken === right.apiToken
  )
}

export function isFreshResolution(
  snapshot: NewTabBootSnapshot | null,
  settings: ExtensionSettings,
  now = Date.now()
) {
  return (
    matchesSettings(snapshot, settings) &&
    snapshot.status === 'success' &&
    snapshot.verifiedAt !== null &&
    now >= snapshot.verifiedAt &&
    now - snapshot.verifiedAt <= VERIFIED_CACHE_TTL_MS &&
    Boolean(snapshot.activeUrl) &&
    !snapshot.failedUrls.includes(snapshot.activeUrl)
  )
}

export function emptyResolution(settings: ExtensionSettings): NewTabBootSnapshot {
  return {
    schemaVersion: 2,
    settingsRevision: settingsRevision(settings),
    primaryUrl: settings.primaryUrl,
    fallbackUrl: settings.fallbackUrl,
    openMode: settings.openMode,
    probeTimeoutMs: settings.probeTimeoutMs,
    activeUrl: '',
    reason: 'unconfigured',
    status: 'unconfigured',
    verifiedAt: null,
    lastAttemptAt: 0,
    failedUrls: [],
    lastSuccessfulUrl: '',
    lastSuccessAt: null,
  }
}

export function normalizeResolution(value: unknown): NewTabBootSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (
    typeof v.primaryUrl !== 'string' ||
    typeof v.fallbackUrl !== 'string' ||
    typeof v.activeUrl !== 'string'
  )
    return null
  const settings: ExtensionSettings = {
    primaryUrl: v.primaryUrl,
    fallbackUrl: v.fallbackUrl,
    apiToken: '',
    openMode: v.openMode === 'embedded' ? 'embedded' : 'direct',
    probeTimeoutMs: typeof v.probeTimeoutMs === 'number' ? v.probeTimeoutMs : 200,
    settingsRevision: typeof v.settingsRevision === 'string' ? v.settingsRevision : 'legacy',
  }
  if (![settings.primaryUrl, settings.fallbackUrl].includes(v.activeUrl) && v.activeUrl !== '')
    return null
  if (v.schemaVersion !== 2) {
    // Old snapshots are hints only: old resolvedAt sometimes recorded a failed attempt.
    return {
      ...emptyResolution(settings),
      activeUrl: v.activeUrl,
      status: 'unverified',
      reason: v.activeUrl === v.primaryUrl ? 'primary-unverified' : 'fallback-unverified',
    }
  }
  const statuses: ResolutionStatus[] = ['success', 'unverified', 'failed', 'unconfigured']
  const reasons: ResolutionReason[] = [
    'primary',
    'fallback',
    'primary-unverified',
    'fallback-unverified',
    'unconfigured',
    'unreachable',
  ]
  if (
    !statuses.includes(v.status as ResolutionStatus) ||
    !reasons.includes(v.reason as ResolutionReason) ||
    typeof v.lastAttemptAt !== 'number' ||
    !Number.isFinite(v.lastAttemptAt)
  )
    return null
  const time = (val: unknown) =>
    typeof val === 'number' && Number.isFinite(val) && val > 0 ? val : null
  return {
    ...emptyResolution(settings),
    activeUrl: v.activeUrl,
    status: v.status as ResolutionStatus,
    reason: v.reason as ResolutionReason,
    verifiedAt: time(v.verifiedAt),
    lastAttemptAt: v.lastAttemptAt,
    failedUrls: Array.isArray(v.failedUrls)
      ? v.failedUrls.filter(
          (url): url is string =>
            typeof url === 'string' && [settings.primaryUrl, settings.fallbackUrl].includes(url)
        )
      : [],
    lastSuccessfulUrl:
      typeof v.lastSuccessfulUrl === 'string' &&
      [settings.primaryUrl, settings.fallbackUrl].includes(v.lastSuccessfulUrl)
        ? v.lastSuccessfulUrl
        : '',
    lastSuccessAt: time(v.lastSuccessAt),
  }
}

export function getInstanceKey(settings: ExtensionSettings) {
  return JSON.stringify([settings.primaryUrl, settings.fallbackUrl])
}
