import { authStatusQueryKey } from '@/features/auth/api'
import { useAppStore } from '@/store/appStore'
import { useBookmarkCache } from '@/features/navigation/useBookmarkCache'
import { Suspense, lazy, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { NavigationViewContext } from '@/features/navigation/navigationView'
import { isLocalNewTab, openConnectionSettings } from '@/lib/clientRuntime'
import { HomePage } from './HomePage'
import {
  BOOKMARK_CACHE_REFRESH,
  BOOKMARK_CACHE_OPEN,
  BOOKMARK_AUTH_REQUIRED,
  startBookmarkCacheBridge,
} from '@/features/navigation/bookmarkCache'
import { navigationConfigQueryKey, systemConfigQueryKey } from '@/features/config/api'
import { dismissSearchBootShell } from '@/components/searchBoot'
import { Button } from '@/components/ui/button'
import { useAuthStatus, clearProtectedQueries } from '@/features/auth/useAuth'
import { useI18n } from '@/i18n/runtime'

const LoginPage = lazy(async () => {
  const module = await import('./LoginPage')
  return { default: module.LoginPage }
})

const SetupPage = lazy(async () => {
  const module = await import('./SetupPage')
  return { default: module.SetupPage }
})

function PageLoadFallback({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  )
}

export function AuthGatePage() {
  const { messages } = useI18n()
  const authStatusQuery = useAuthStatus()
  const [connectionChanged, setConnectionChanged] = useState(false)
  const [online, setOnline] = useState(navigator.onLine !== false)
  const cache = useBookmarkCache()
  const { refetch: refreshAuth } = authStatusQuery
  const queryClient = useQueryClient()
  useEffect(startBookmarkCacheBridge, [])
  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine !== false)
      void refreshAuth()
      void queryClient.invalidateQueries({ queryKey: navigationConfigQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['navigation'] })
      void queryClient.invalidateQueries({ queryKey: systemConfigQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['preferences'] })
    }
    const open = (event: Event) => {
      const { query, sceneId } = (event as CustomEvent<{ query: string; sceneId?: string }>).detail
      useAppStore.getState().setSearchKeyword(query)
      if (sceneId) useAppStore.getState().initializeActiveScene(sceneId, false)
    }
    const requireAuth = () => {
      clearProtectedQueries(queryClient)
      void queryClient.cancelQueries({ queryKey: authStatusQueryKey }).then(() => {
        queryClient.setQueryData(authStatusQueryKey, { authenticated: false, setupRequired: false })
      })
    }
    const revoke = () => {
      clearProtectedQueries(queryClient)
      void queryClient.cancelQueries({ queryKey: authStatusQueryKey })
      queryClient.setQueryData(authStatusQueryKey, { authenticated: false, setupRequired: false })
    }
    const offline = () => setOnline(false)
    const settingsChanged = () => {
      setOnline(false)
      setConnectionChanged(true)
    }
    window.addEventListener('harbordeck-cache-revoked', revoke)
    window.addEventListener('harbordeck-source-changed', settingsChanged)
    window.addEventListener('offline', offline)
    window.addEventListener(BOOKMARK_AUTH_REQUIRED, requireAuth)
    window.addEventListener(BOOKMARK_CACHE_OPEN, open)
    window.addEventListener(BOOKMARK_CACHE_REFRESH, refresh)
    window.addEventListener('online', refresh)
    return () => {
      window.removeEventListener('harbordeck-cache-revoked', revoke)
      window.removeEventListener('harbordeck-source-changed', settingsChanged)
      window.removeEventListener('offline', offline)
      window.removeEventListener(BOOKMARK_AUTH_REQUIRED, requireAuth)
      window.removeEventListener(BOOKMARK_CACHE_OPEN, open)
      window.removeEventListener(BOOKMARK_CACHE_REFRESH, refresh)
      window.removeEventListener('online', refresh)
    }
  }, [refreshAuth, queryClient])

  useEffect(() => {
    if (authStatusQuery.data && !authStatusQuery.data.authenticated) dismissSearchBootShell()
    const status = document.getElementById('boot-status')
    if (status) {
      status.textContent = authStatusQuery.isError
        ? '暂时无法连接，可以继续输入、重新检测或手动打开 / Connection unavailable'
        : ''
      status.hidden = !authStatusQuery.isError
    }
  }, [authStatusQuery.data, authStatusQuery.isError, authStatusQuery.isLoading])

  const status = authStatusQuery.data
  if (status && !status.authenticated) {
    return (
      <Suspense fallback={<PageLoadFallback label={messages.common.loading} />}>
        {status.setupRequired ? <SetupPage /> : <LoginPage />}
      </Suspense>
    )
  }

  return (
    <NavigationViewContext.Provider
      value={{
        authenticated: Boolean(status?.authenticated),
        online: online && !connectionChanged,
        snapshot: cache,
      }}
    >
      <HomePage />
      {(connectionChanged || authStatusQuery.isError || (isLocalNewTab() && !status)) && (
        <div
          role="status"
          className="fixed bottom-3 left-1/2 z-[160] -translate-x-1/2 rounded-xl border bg-background px-4 py-2 text-xs shadow"
        >
          {connectionChanged
            ? '连接设置已变更，请打开新标签页；当前草稿保留 / Connection changed; open a new tab. Draft kept.'
            : authStatusQuery.isFetching
              ? '正在连接 / Connecting'
              : '暂时无法连接，已有书签仍可使用 / Connection unavailable'}
          <Button
            variant="ghost"
            size="sm"
            disabled={connectionChanged}
            onClick={() => window.dispatchEvent(new Event(BOOKMARK_CACHE_REFRESH))}
          >
            {messages.common.refresh}
          </Button>
          {isLocalNewTab() && (
            <Button variant="ghost" size="sm" onClick={openConnectionSettings}>
              连接设置 / Connection
            </Button>
          )}
        </div>
      )}
    </NavigationViewContext.Provider>
  )
}
