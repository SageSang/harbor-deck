import type { ExtensionSettings, NewTabBootSnapshot } from './types'
import { isAppSkin, type AppSkin } from '@shared/theme'
import { emptyResolution, matchesSettings, MANUAL_CACHE_TTL_MS } from './resolutionState'

function getOriginPattern(url: string): string {
  const parsed = new URL(url)
  return `${parsed.origin}/*`
}

export function getPermissionOrigins(urls: string[]): string[] {
  return Array.from(new Set(urls.filter(Boolean).map((url) => getOriginPattern(url))))
}

export async function hasOriginPermission(url: string): Promise<boolean> {
  return chrome.permissions.contains({
    origins: [getOriginPattern(url)],
  })
}

export async function requestOriginPermissions(urls: string[]): Promise<boolean> {
  const origins = getPermissionOrigins(urls)
  if (origins.length === 0) {
    return true
  }

  return chrome.permissions.request({ origins })
}

async function probe(baseUrl: string, timeoutMs: number): Promise<boolean | null> {
  try {
    if (!(await hasOriginPermission(baseUrl))) return null
  } catch {
    return null
  }

  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const healthUrl = new URL('/api/health', baseUrl).toString()
    const response = await fetch(healthUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

export async function fetchRemoteTheme(
  baseUrl: string,
  apiToken: string,
  timeoutMs = 1200
): Promise<AppSkin | null> {
  if (!baseUrl || !apiToken) return null

  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(new URL('/api/integrations/theme', baseUrl), {
      headers: { 'X-HarborDeck-Search-Token': apiToken },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) return null

    const payload: unknown = await response.json()
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      !isAppSkin((payload as Record<string, unknown>).skin)
    ) {
      return null
    }

    return (payload as { skin: AppSkin }).skin
  } catch {
    return null
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

/** Pure network selection. Storage is owned by the service worker. */
export async function probeAvailableTarget(
  settings: ExtensionSettings,
  previous: NewTabBootSnapshot | null,
  options: { failedUrl?: string; verifySingle?: boolean } = {}
): Promise<NewTabBootSnapshot> {
  const now = Date.now()
  const current = matchesSettings(previous, settings) ? previous : null
  const urls = [settings.primaryUrl, settings.fallbackUrl].filter(Boolean)
  const failed = new Set(current?.failedUrls ?? [])
  if (options.failedUrl && urls.includes(options.failedUrl)) failed.add(options.failedUrl)
  const result = { ...emptyResolution(settings), lastAttemptAt: now }
  if (current?.lastSuccessAt && now - current.lastSuccessAt <= MANUAL_CACHE_TTL_MS) {
    result.lastSuccessfulUrl = current.lastSuccessfulUrl
    result.lastSuccessAt = current.lastSuccessAt
  }
  if (!urls.length) return result

  const finish = (url: string, verified: boolean): NewTabBootSnapshot => {
    const primary = url === settings.primaryUrl
    return {
      ...result,
      activeUrl: url,
      status: verified ? 'success' : 'unverified',
      reason: primary
        ? verified
          ? 'primary'
          : 'primary-unverified'
        : verified
          ? 'fallback'
          : 'fallback-unverified',
      verifiedAt: verified ? Date.now() : null,
      failedUrls: [...failed],
      ...(verified ? { lastSuccessfulUrl: url, lastSuccessAt: Date.now() } : {}),
    }
  }
  const unavailable = (): NewTabBootSnapshot => ({
    ...result,
    status: 'failed',
    reason: 'unreachable',
    failedUrls: [...failed],
  })
  if (urls.length === 1 && !failed.has(urls[0]) && !options.verifySingle)
    return finish(urls[0], false)

  const check = async (url: string): Promise<boolean | null> => {
    if (!url) return null
    const reachable = await probe(url, settings.probeTimeoutMs)
    if (reachable === true) failed.delete(url)
    else if (reachable === false) failed.add(url)
    return reachable
  }
  const fallbackTask = check(settings.fallbackUrl)
  const primaryReachable = await check(settings.primaryUrl)
  // Primary success can be published without waiting for a slow secondary.
  if (primaryReachable === true) return finish(settings.primaryUrl, true)
  const fallbackReachable = await fallbackTask
  if (fallbackReachable === true) return finish(settings.fallbackUrl, true)
  if (settings.primaryUrl && primaryReachable === null && !failed.has(settings.primaryUrl))
    return finish(settings.primaryUrl, false)
  if (settings.fallbackUrl && fallbackReachable === null && !failed.has(settings.fallbackUrl))
    return finish(settings.fallbackUrl, false)
  return unavailable()
}
