import { createRoot } from 'react-dom/client'
import { Providers } from '@/app/providers'
import { AuthGatePage } from '@/pages/AuthGatePage'
import { useAppStore } from '@/store/appStore'
import { getSearchBootValue } from '@/components/searchBoot'
import '@/index.css'

useAppStore.getState().setSearchKeyword(getSearchBootValue())
window.addEventListener('harbordeck-source-selected', () =>
  useAppStore.getState().clearSceneTokens()
)
createRoot(document.getElementById('root')!).render(
  <Providers>
    <AuthGatePage />
  </Providers>
)
