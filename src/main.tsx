import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installEmbeddedFocusGuard } from './components/searchFocus'
import { useAppStore } from './store/appStore'
import './index.css'

const params = new URLSearchParams(window.location.search)
const isEmbedded = params.get('embedded') === '1'
const handoffQuery = params.get('harbordeckQuery')?.trim()

if (handoffQuery) {
  useAppStore.getState().setSearchKeyword(handoffQuery.slice(0, 2000))
}

if (isEmbedded) {
  installEmbeddedFocusGuard()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
