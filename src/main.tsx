import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { getSearchBootValue, MAX_SEARCH_BOOT_LENGTH } from './components/searchBoot'
import { installEmbeddedFocusGuard } from './components/searchFocus'
import { useAppStore } from './store/appStore'
import './index.css'

const params = new URLSearchParams(window.location.search)
const isEmbedded = params.get('embedded') === '1'
const handoffQuery = getSearchBootValue() || params.get('harbordeckQuery') || ''

if (handoffQuery.trim()) {
  useAppStore.getState().setSearchKeyword(handoffQuery.slice(0, MAX_SEARCH_BOOT_LENGTH))
}

if (isEmbedded) {
  installEmbeddedFocusGuard()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
