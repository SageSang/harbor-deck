import { withReadTimeout } from '@shared/readTimeout'
import {
  bookmarkCacheEpoch,
  clearBookmarkCache,
  setBookmarkCacheUser,
} from '@/features/navigation/bookmarkCache'
export interface AuthStatus {
  setupRequired: boolean
  authenticated: boolean
  username?: string
}

interface JsonRequestOptions extends RequestInit {
  fallbackMessage: string
}

export interface LoginPayload {
  username: string
  password: string
}

export interface UpdateCredentialsPayload {
  currentPassword: string
  nextUsername: string
  nextPassword: string
}

async function requestJson<T>(url: string, options: JsonRequestOptions): Promise<T> {
  if (options.method !== 'GET' && navigator.onLine === false) throw new Error('当前离线 / Offline')
  const cacheEpoch = bookmarkCacheEpoch()
  const read = async (signal?: AbortSignal | null) => {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
      credentials: 'same-origin',
      ...options,
      signal,
    })

    if (!response.ok) {
      if (
        (response.status === 401 || response.status === 403) &&
        cacheEpoch === bookmarkCacheEpoch()
      )
        clearBookmarkCache(true)
      const message = await response.text()
      throw new Error(message || options.fallbackMessage)
    }

    return response.json() as Promise<T>
  }
  return options.method === 'GET' ? withReadTimeout(options.signal, read) : read(options.signal)
}

export const authStatusQueryKey = ['auth', 'status'] as const

export async function fetchAuthStatus() {
  const epoch = bookmarkCacheEpoch()
  const status = await requestJson<AuthStatus>('/api/auth/status', {
    method: 'GET',
    fallbackMessage: '鉴权状态获取失败',
  })
  if (epoch === bookmarkCacheEpoch())
    setBookmarkCacheUser(status.authenticated ? (status.username ?? null) : null)
  return status
}

export async function login(payload: LoginPayload) {
  clearBookmarkCache(true)
  const epoch = bookmarkCacheEpoch()
  const status = await requestJson<AuthStatus>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackMessage: '登录失败',
  })
  if (epoch === bookmarkCacheEpoch())
    setBookmarkCacheUser(status.authenticated ? (status.username ?? null) : null)
  return status
}

export async function setup(payload: LoginPayload) {
  clearBookmarkCache(true)
  const epoch = bookmarkCacheEpoch()
  const status = await requestJson<AuthStatus>('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackMessage: '创建管理员账号失败',
  })
  if (epoch === bookmarkCacheEpoch())
    setBookmarkCacheUser(status.authenticated ? (status.username ?? null) : null)
  return status
}

export function logout() {
  clearBookmarkCache(true)
  return requestJson<{ ok: true }>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
    fallbackMessage: '退出登录失败',
  })
}

export async function updateCredentials(payload: UpdateCredentialsPayload) {
  clearBookmarkCache(true)
  const epoch = bookmarkCacheEpoch()
  const status = await requestJson<AuthStatus>('/api/auth/credentials', {
    method: 'PUT',
    body: JSON.stringify(payload),
    fallbackMessage: '更新账号密码失败',
  })
  if (epoch === bookmarkCacheEpoch())
    setBookmarkCacheUser(status.authenticated ? (status.username ?? null) : null)
  return status
}
