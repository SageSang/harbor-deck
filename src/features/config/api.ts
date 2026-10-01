import { withReadTimeout } from '@shared/readTimeout'
import {
  BOOKMARK_AUTH_REQUIRED,
  bookmarkCacheEpoch,
  captureBookmarkCacheScope,
  clearBookmarkCache,
  saveBookmarkCache,
} from '@/features/navigation/bookmarkCache'
import { defaultSystemConfig } from '@/config/defaultConfig'
import {
  appConfigSchema,
  navigationConfigSchema,
  servicesConfigSchema,
  systemConfigSchema,
  type AppConfig,
  type NavigationConfig,
  type ServicesConfig,
  type SystemConfig,
} from '@/config/schema'
import { getCurrentMessages } from '@/i18n/runtime'
import { parseAppConfig } from '@/features/config/appConfig'
import { readSceneTokens } from '@/features/navigation/scenePreference'

export { defaultSystemConfig }

export const appConfigQueryKey = ['config', 'app'] as const
export const navigationConfigQueryKey = ['config', 'navigation'] as const
export const sceneListQueryKey = ['navigation', 'scenes'] as const
export const sceneServicesQueryKey = (sceneId: string | null) =>
  ['navigation', 'services', sceneId] as const
export const systemConfigQueryKey = ['config', 'system'] as const

export interface ApiRequestOptions extends RequestInit {
  fallbackMessage?: string
  onResponse?: (response: Response) => void
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export async function requestJson<T>(url: string, options?: ApiRequestOptions): Promise<T> {
  if (options?.method && options.method.toUpperCase() !== 'GET' && navigator.onLine === false) {
    throw new Error('当前离线，修改不会自动提交 / Offline; changes are not queued')
  }
  const cacheEpoch = bookmarkCacheEpoch()
  const messages = getCurrentMessages()
  const { fallbackMessage, onResponse, headers: optionHeaders, ...requestOptions } = options ?? {}
  const sceneTokens = readSceneTokens()
  const headers = new Headers(optionHeaders)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (Object.keys(sceneTokens).length) {
    headers.set('X-Scene-Tokens', JSON.stringify(sceneTokens))
  }
  const read = async (signal?: AbortSignal | null) => {
    const response = await fetch(url, { ...requestOptions, headers, signal })
    onResponse?.(response)

    if (!response.ok) {
      if (
        (response.status === 401 || response.status === 403) &&
        cacheEpoch === bookmarkCacheEpoch()
      ) {
        clearBookmarkCache(response.status === 401)
        if (response.status === 401) window.dispatchEvent(new Event(BOOKMARK_AUTH_REQUIRED))
      }
      const message = await response.text()
      throw new ApiError(
        message || fallbackMessage || messages.common.requestFailed,
        response.status
      )
    }

    return response.json() as Promise<T>
  }
  return !requestOptions.method || requestOptions.method.toUpperCase() === 'GET'
    ? withReadTimeout(requestOptions.signal, read)
    : read(requestOptions.signal)
}

function revisionHeaders(revision?: string) {
  if (!revision)
    throw new ApiError('请重新加载配置后再保存 / Reload configuration before saving', 428)
  return { 'If-Match': `"${revision}"` }
}

export function appRevision(config: AppConfig) {
  return config.navigation._revision && config.system._revision
    ? `${config.navigation._revision}/${config.system._revision}`
    : undefined
}

export async function fetchAppConfig(): Promise<AppConfig> {
  const messages = getCurrentMessages()
  const data = await requestJson<unknown>('/api/config/app', {
    fallbackMessage: messages.errors.loadAppConfigFailed,
  })
  return parseAppConfig(data)
}

export async function saveAppConfig(config: AppConfig): Promise<AppConfig> {
  const messages = getCurrentMessages()
  const data = await requestJson<unknown>('/api/config/app', {
    method: 'PUT',
    headers: revisionHeaders(appRevision(config)),
    body: JSON.stringify(config),
    fallbackMessage: messages.errors.saveAppConfigFailed,
  })
  return appConfigSchema.parse(parseAppConfig(data))
}

export async function fetchNavigationConfig(signal?: AbortSignal): Promise<NavigationConfig> {
  const messages = getCurrentMessages()
  const scope = captureBookmarkCacheScope()
  const data = await requestJson<unknown>('/api/config/navigation', {
    signal,
    fallbackMessage: messages.errors.loadServicesConfigFailed,
  })
  const parsed = navigationConfigSchema.parse(data)
  if (!signal?.aborted) saveBookmarkCache(parsed, scope)
  return parsed
}

export async function saveNavigationConfig(config: NavigationConfig): Promise<NavigationConfig> {
  const messages = getCurrentMessages()
  const data = await requestJson<unknown>('/api/config/navigation', {
    method: 'PUT',
    headers: revisionHeaders(config._revision),
    body: JSON.stringify(config),
    fallbackMessage: messages.errors.saveServicesConfigFailed,
  })
  return navigationConfigSchema.parse(data)
}

export interface SceneSummary {
  id: string
  name: string
  protected: boolean
}

export interface SceneListResponse {
  defaultSceneId: string
  scenes: SceneSummary[]
}

export async function fetchSceneList(signal?: AbortSignal): Promise<SceneListResponse> {
  return requestJson<SceneListResponse>('/api/navigation/scenes', { signal })
}

export async function fetchSceneServices(
  sceneId: string,
  token?: string,
  signal?: AbortSignal
): Promise<ServicesConfig> {
  const data = await requestJson<unknown>(
    `/api/navigation?sceneId=${encodeURIComponent(sceneId)}`,
    { signal, ...(token ? { headers: { 'X-Scene-Token': token } } : {}) }
  )
  return servicesConfigSchema.parse(data)
}

export async function unlockScene(sceneId: string, password: string) {
  return requestJson<{ token: string | null; expiresAt: number | null }>(
    `/api/navigation/scenes/${encodeURIComponent(sceneId)}/unlock`,
    {
      method: 'POST',
      body: JSON.stringify({ password }),
    }
  )
}

export async function lockScene(sceneId: string, token?: string) {
  return requestJson<{ ok: true }>(`/api/navigation/scenes/${encodeURIComponent(sceneId)}/lock`, {
    method: 'POST',
    body: JSON.stringify({}),
    ...(token ? { headers: { 'X-Scene-Token': token } } : {}),
  })
}

export async function setScenePassword(
  sceneId: string,
  password: string | null,
  revision?: string
) {
  const data = await requestJson<unknown>(
    `/api/config/navigation/scenes/${encodeURIComponent(sceneId)}/password`,
    {
      method: 'PUT',
      headers: revisionHeaders(revision),
      body: JSON.stringify({ password }),
    }
  )
  return navigationConfigSchema.parse(data)
}

export async function fetchSystemConfig(): Promise<SystemConfig> {
  const messages = getCurrentMessages()
  const data = await requestJson<unknown>('/api/config/system', {
    fallbackMessage: messages.errors.loadSystemConfigFailed,
  })
  return systemConfigSchema.parse(data)
}

export async function saveSystemConfig(config: SystemConfig): Promise<SystemConfig> {
  const messages = getCurrentMessages()
  const data = await requestJson<unknown>('/api/config/system', {
    method: 'PUT',
    headers: revisionHeaders(config._revision),
    body: JSON.stringify(config),
    fallbackMessage: messages.errors.saveSystemConfigFailed,
  })
  return systemConfigSchema.parse(data)
}
