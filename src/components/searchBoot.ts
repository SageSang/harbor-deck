export const SEARCH_BOOT_SHELL_ID = 'harbordeck-search-boot'
export const SEARCH_BOOT_INPUT_ID = 'harbordeck-search-boot-input'
export const SEARCH_BOOT_INPUT_EVENT = 'harbordeck:search-boot-input'
export const MAX_SEARCH_BOOT_LENGTH = 2000

export interface SearchBootState {
  value: string
  revision: number
  pendingSubmit: boolean
  released: boolean
}

declare global {
  interface Window {
    __harborDeckSearchBoot?: SearchBootState
  }
}

export function getSearchBootState() {
  return typeof window === 'undefined' ? undefined : window.__harborDeckSearchBoot
}

export function getSearchBootValue() {
  const state = getSearchBootState()
  if (state) return state.value.slice(0, MAX_SEARCH_BOOT_LENGTH)

  if (typeof document === 'undefined') return ''
  const input = document.getElementById(SEARCH_BOOT_INPUT_ID)
  return input instanceof HTMLInputElement ? input.value.slice(0, MAX_SEARCH_BOOT_LENGTH) : ''
}

export function dismissSearchBootShell() {
  const state = getSearchBootState()
  if (state) state.released = true
  document.getElementById(SEARCH_BOOT_SHELL_ID)?.remove()
}
