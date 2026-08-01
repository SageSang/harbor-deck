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
import { defaultAppConfig, parseAppConfig } from '@/features/config/appConfig'
import { defaultNavigationConfig } from '@/config/defaultConfig'
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
  const messages = getCurrentMessages()
  const { fallbackMessage, headers: optionHeaders, ...requestOptions } = options ?? {}
  const sceneTokens = readSceneTokens()
  const headers = new Headers(optionHeaders)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (Object.keys(sceneTokens).length) {
    headers.set('X-Scene-Tokens', JSON.stringify(sceneTokens))
  }
  const response = await fetch(url, {
    ...requestOptions,
    headers,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new ApiError(
      message || fallbackMessage || messages.common.requestFailed,
      response.status
    )
  }

  return response.json() as Promise<T>
}

function isNetworkError(error: unknown) {
  return error instanceof TypeError
}

export async function fetchAppConfig(): Promise<AppConfig> {
  const messages = getCurrentMessages()

  try {
    const data = await requestJson<unknown>('/api/config/app', {
      fallbackMessage: messages.errors.loadAppConfigFailed,
    })
    return parseAppConfig(data)
  } catch (error) {
    if (isNetworkError(error)) {
      return defaultAppConfig
    }
    throw error
  }
}

export async function saveAppConfig(config: AppConfig): Promise<AppConfig> {
  const messages = getCurrentMessages()
  const data = await requestJson<unknown>('/api/config/app', {
    method: 'PUT',
    body: JSON.stringify(config),
    fallbackMessage: messages.errors.saveAppConfigFailed,
  })
  return appConfigSchema.parse(parseAppConfig(data))
}

export async function fetchNavigationConfig(): Promise<NavigationConfig> {
  const messages = getCurrentMessages()

  try {
    const data = await requestJson<unknown>('/api/config/navigation', {
      fallbackMessage: messages.errors.loadServicesConfigFailed,
    })
    return navigationConfigSchema.parse(data)
  } catch (error) {
    if (isNetworkError(error)) {
      return defaultNavigationConfig
    }
    throw error
  }
}

export async function saveNavigationConfig(config: NavigationConfig): Promise<NavigationConfig> {
  const messages = getCurrentMessages()
  const data = await requestJson<unknown>('/api/config/navigation', {
    method: 'PUT',
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

export async function fetchSceneList(): Promise<SceneListResponse> {
  return requestJson<SceneListResponse>('/api/navigation/scenes')
}

export async function fetchSceneServices(sceneId: string, token?: string): Promise<ServicesConfig> {
  const data = await requestJson<unknown>(
    `/api/navigation?sceneId=${encodeURIComponent(sceneId)}`,
    token ? { headers: { 'X-Scene-Token': token } } : undefined
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
  return requestJson<{ ok: true }>(
    `/api/navigation/scenes/${encodeURIComponent(sceneId)}/lock`,
    {
      method: 'POST',
      body: JSON.stringify({}),
      ...(token ? { headers: { 'X-Scene-Token': token } } : {}),
    }
  )
}

export async function setScenePassword(sceneId: string, password: string | null) {
  const data = await requestJson<unknown>(
    `/api/config/navigation/scenes/${encodeURIComponent(sceneId)}/password`,
    {
      method: 'PUT',
      body: JSON.stringify({ password }),
    }
  )
  return navigationConfigSchema.parse(data)
}

export async function fetchSystemConfig(): Promise<SystemConfig> {
  const messages = getCurrentMessages()

  try {
    const data = await requestJson<unknown>('/api/config/system', {
      fallbackMessage: messages.errors.loadSystemConfigFailed,
    })
    return systemConfigSchema.parse(data)
  } catch (error) {
    if (isNetworkError(error)) {
      return defaultSystemConfig
    }
    throw error
  }
}

export async function saveSystemConfig(config: SystemConfig): Promise<SystemConfig> {
  const messages = getCurrentMessages()
  const data = await requestJson<unknown>('/api/config/system', {
    method: 'PUT',
    body: JSON.stringify(config),
    fallbackMessage: messages.errors.saveSystemConfigFailed,
  })
  return systemConfigSchema.parse(data)
}
