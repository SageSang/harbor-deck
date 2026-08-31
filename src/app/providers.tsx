import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { FeedbackProvider } from '@/features/feedback/FeedbackProvider'
import { useAppStore } from '@/store/appStore'
import { skinUsesDarkMode } from '@shared/theme'

const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  const skin = useAppStore((state) => state.skin)
  const language = useAppStore((state) => state.language)

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
