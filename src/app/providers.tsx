import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { FeedbackProvider } from '@/features/feedback/FeedbackProvider'
import { useAppStore } from '@/store/appStore'
import { navigationConfigQueryKey, appConfigQueryKey } from '@/features/config/api'
import { skinUsesDarkMode } from '@shared/theme'

const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  const skin = useAppStore((state) => state.skin)
  const language = useAppStore((state) => state.language)

  useEffect(
    () =>
      useAppStore.subscribe((state, previous) => {
        if (state.sceneAccessVersion === previous.sceneAccessVersion) return
        // Cancel and discard obsolete access snapshots, including in-flight reads.
        const obsolete = (key: readonly unknown[]) =>
          (key[0] === navigationConfigQueryKey[0] &&
            key[1] === navigationConfigQueryKey[1] &&
            key[2] !== state.sceneAccessVersion) ||
          (key[0] === 'navigation' &&
            key[1] === 'services' &&
            key[3] !== state.sceneAccessVersion) ||
          (key[0] === appConfigQueryKey[0] && key[1] === appConfigQueryKey[1])
        void queryClient.cancelQueries({ predicate: (query) => obsolete(query.queryKey) })
        queryClient.removeQueries({ predicate: (query) => obsolete(query.queryKey) })
      }),
    []
  )

  useEffect(() => {
    document.documentElement.dataset.skin = skin
    document.documentElement.classList.toggle('dark', skinUsesDarkMode(skin))
  }, [skin])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  return (
    <QueryClientProvider client={queryClient}>
      <FeedbackProvider>{children}</FeedbackProvider>
    </QueryClientProvider>
  )
}
