import { Suspense, lazy, useEffect } from 'react'
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

export function AuthGatePage() {
  const { messages } = useI18n()
  const authStatusQuery = useAuthStatus()

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
    return <PageLoadFallback label={messages.authPage.checking} />
  }

  if (authStatusQuery.isError || !authStatusQuery.data) {
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
      <HomePage />
    </Suspense>
  )
}
