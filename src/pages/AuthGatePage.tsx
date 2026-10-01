import { authStatusQueryKey } from '@/features/auth/api'
import { useAppStore } from '@/store/appStore'
import { useBookmarkCache } from '@/features/navigation/useBookmarkCache'
import { Suspense, lazy, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BookmarkCacheFallback } from '@/features/navigation/BookmarkCacheFallback'
import {
  BOOKMARK_CACHE_REFRESH,
  BOOKMARK_CACHE_OPEN,
  BOOKMARK_AUTH_REQUIRED,
  startBookmarkCacheBridge,
} from '@/features/navigation/bookmarkCache'
import { useNavigationConfig, useActiveSceneServices } from '@/features/navigation/useNavigation'
import { navigationConfigQueryKey } from '@/features/config/api'
import { dismissSearchBootShell } from '@/components/searchBoot'
import { Button } from '@/components/ui/button'
import { useAuthStatus } from '@/features/auth/useAuth'
import { useI18n } from '@/i18n/runtime'

const HomePage = lazy(async () => {
  const module = await import('./HomePage')
  return { default: module.HomePage }
})

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

function NavigationStartup() {
  const navigation = useNavigationConfig()
  const services = useActiveSceneServices()
  const cache = useBookmarkCache()
  const opened = useRef(false)
  const ready = Boolean(navigation.data && (services.data || services.activeScene?.protected))
  if (ready) opened.current = true
  if (!opened.current && cache)
    return (
      <BookmarkCacheFallback
        busy={navigation.isFetching || services.isFetching || services.sceneListQuery.isFetching}
        onRefresh={() => {
          void navigation.refetch()
          void services.sceneListQuery.refetch()
          if (services.activeSceneId) void services.refetch()
        }}
      />
    )
  return <HomePage />
}

export function AuthGatePage() {
  const { messages } = useI18n()
  const authStatusQuery = useAuthStatus()
  const cache = useBookmarkCache()
  const { refetch: refreshAuth } = authStatusQuery
  const queryClient = useQueryClient()
  useEffect(startBookmarkCacheBridge, [])
  useEffect(() => {
    const refresh = () => {
      void refreshAuth()
      void queryClient.invalidateQueries({ queryKey: navigationConfigQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['navigation'] })
    }
    const open = (event: Event) => {
      const { query, sceneId } = (event as CustomEvent<{ query: string; sceneId?: string }>).detail
      useAppStore.getState().setSearchKeyword(query)
      if (sceneId) useAppStore.getState().initializeActiveScene(sceneId, false)
    }
    const requireAuth = () => {
      void queryClient.cancelQueries({ queryKey: authStatusQueryKey }).then(() => {
        queryClient.setQueryData(authStatusQueryKey, { authenticated: false, setupRequired: false })
      })
    }
    window.addEventListener(BOOKMARK_AUTH_REQUIRED, requireAuth)
    window.addEventListener(BOOKMARK_CACHE_OPEN, open)
    window.addEventListener(BOOKMARK_CACHE_REFRESH, refresh)
    window.addEventListener('online', refresh)
    return () => {
      window.removeEventListener(BOOKMARK_AUTH_REQUIRED, requireAuth)
      window.removeEventListener(BOOKMARK_CACHE_OPEN, open)
      window.removeEventListener(BOOKMARK_CACHE_REFRESH, refresh)
      window.removeEventListener('online', refresh)
    }
  }, [refreshAuth, queryClient])

  useEffect(() => {
    if (
      !authStatusQuery.isLoading &&
      (authStatusQuery.isError ||
        !authStatusQuery.data ||
        authStatusQuery.data.setupRequired ||
        !authStatusQuery.data.authenticated)
    ) {
      dismissSearchBootShell()
    }
  }, [authStatusQuery.data, authStatusQuery.isError, authStatusQuery.isLoading])

  if (authStatusQuery.isLoading) {
    if (cache)
      return (
        <BookmarkCacheFallback
          busy={authStatusQuery.isFetching}
          onRefresh={() => void authStatusQuery.refetch()}
        />
      )
    return <PageLoadFallback label={messages.authPage.checking} />
  }

  if ((authStatusQuery.isError && !authStatusQuery.data?.authenticated) || !authStatusQuery.data) {
    if (cache)
      return (
        <BookmarkCacheFallback
          busy={authStatusQuery.isFetching}
          onRefresh={() => void authStatusQuery.refetch()}
        />
      )
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border/80 bg-background p-6 shadow-lg">
          <p className="text-sm text-foreground">{messages.authPage.unknownError}</p>
          <Button type="button" className="mt-4" onClick={() => authStatusQuery.refetch()}>
            {messages.common.refresh}
          </Button>
        </div>
      </div>
    )
  }

  if (authStatusQuery.data.setupRequired) {
    return (
      <Suspense fallback={<PageLoadFallback label={messages.common.loading} />}>
        <SetupPage />
      </Suspense>
    )
  }

  if (!authStatusQuery.data.authenticated) {
    return (
      <Suspense fallback={<PageLoadFallback label={messages.common.loading} />}>
        <LoginPage />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<PageLoadFallback label={messages.common.loading} />}>
      <NavigationStartup />
    </Suspense>
  )
}
