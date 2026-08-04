import type { ResolvedTarget } from '@extension/types'
import {
  clearResolutionCache,
  normalizeProbeTimeoutMs,
  readResolutionCache,
  RESOLUTION_CACHE_TTL_MS,
  writeResolutionCache,
} from '@extension/storage'

function getOriginPattern(url: string): string {
  const parsed = new URL(url)
  return `${parsed.origin}/*`
}

export function getPermissionOrigins(urls: string[]): string[] {
  return Array.from(
    new Set(
      urls
        .filter(Boolean)
        .map((url) => getOriginPattern(url))
    )
  )
}

async function hasOriginPermission(url: string): Promise<boolean> {
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
  if (!(await hasOriginPermission(baseUrl))) {
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

function isFreshCache(resolvedAt: number) {
  return Date.now() - resolvedAt <= RESOLUTION_CACHE_TTL_MS
}

async function cacheResolvedTarget(
  primaryUrl: string,
  fallbackUrl: string,
  target: ResolvedTarget,
  cacheable: boolean
) {
  if (!cacheable || !target.activeUrl || target.reason === 'unconfigured') {
    return
  }

  await writeResolutionCache({
    primaryUrl,
    fallbackUrl,
    activeUrl: target.activeUrl,
    reason: target.reason,
    resolvedAt: Date.now(),
  })
}

export async function resolveAvailableTarget(
  primaryUrl: string,
  fallbackUrl: string,
  probeTimeoutMs?: number,
  forceRefresh = false
): Promise<ResolvedTarget> {
  const cached = await readResolutionCache()
  if (
    !forceRefresh &&
    cached &&
    cached.primaryUrl === primaryUrl &&
    cached.fallbackUrl === fallbackUrl &&
    isFreshCache(cached.resolvedAt)
  ) {
    return {
      activeUrl: cached.activeUrl,
      reason: cached.reason,
    }
  }

  if (!primaryUrl && !fallbackUrl) {
    await clearResolutionCache()
    return {
      activeUrl: '',
      reason: 'unconfigured',
    }
  }

  if (!primaryUrl) {
    const result: ResolvedTarget = {
      activeUrl: fallbackUrl,
      reason: 'fallback-unverified',
    }
    await cacheResolvedTarget(primaryUrl, fallbackUrl, result, true)
    return result
  }

  if (!fallbackUrl) {
    const result: ResolvedTarget = {
      activeUrl: primaryUrl,
      reason: 'primary-unverified',
    }
    await cacheResolvedTarget(primaryUrl, fallbackUrl, result, true)
    return result
  }

  const timeoutMs = normalizeProbeTimeoutMs(probeTimeoutMs)
  const [primaryReachable, fallbackReachable] = await Promise.all([
    probe(primaryUrl, timeoutMs),
    probe(fallbackUrl, timeoutMs),
  ])

  if (primaryReachable !== false) {
    const result: ResolvedTarget = {
      activeUrl: primaryUrl,
      reason: primaryReachable === null ? 'primary-unverified' : 'primary',
    }
    await cacheResolvedTarget(primaryUrl, fallbackUrl, result, true)
    return result
  }

  if (fallbackReachable !== false) {
    const result: ResolvedTarget = {
      activeUrl: fallbackUrl,
      reason: fallbackReachable === null ? 'fallback-unverified' : 'fallback',
    }
    await cacheResolvedTarget(primaryUrl, fallbackUrl, result, true)
    return result
  }

  const result: ResolvedTarget = {
    activeUrl: fallbackUrl,
    reason: 'fallback',
  }
  await clearResolutionCache()
  await cacheResolvedTarget(primaryUrl, fallbackUrl, result, false)
  return result
}
