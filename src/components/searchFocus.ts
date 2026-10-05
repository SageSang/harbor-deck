export const SEARCH_INPUT_ID = 'search-box-input'
export const EMBEDDED_FOCUS_MESSAGE_TYPE = 'harbordeck:focus-search'

let userInteracted = false
let focusGuardInstalled = false

/**
 * Register input protection before React mounts so a new-tab/embedded page never
 * steals focus after the user has already started interacting with it.
 */
export function installSearchFocusGuard() {
  if (focusGuardInstalled || typeof window === 'undefined') {
    return
  }

  const markInteraction = () => {
    userInteracted = true
  }

  window.addEventListener('pointerdown', markInteraction, true)
  window.addEventListener('keydown', markInteraction, true)
  window.addEventListener('beforeinput', markInteraction, true)
  window.addEventListener('input', markInteraction, true)
  window.addEventListener('compositionstart', markInteraction, true)
  // After the user moves to browser chrome or another tab, asynchronous data
  // must not take their focus back. Initial focus is attempted only at startup.
  window.addEventListener('blur', markInteraction)
  focusGuardInstalled = true
}

/** Focus only while the page still has no user interaction. */
export function focusSearchInputIfSafe(inputId = SEARCH_INPUT_ID) {
  if (userInteracted || typeof document === 'undefined') {
    return false
  }

  const activeElement = document.activeElement
  if (
    activeElement &&
    activeElement !== document.body &&
    activeElement !== document.documentElement
  ) {
    return false
  }

  const input = document.getElementById(inputId)
  if (!(input instanceof HTMLInputElement)) return false
  input.focus({ preventScroll: true })
  return document.activeElement === input
}

/** Focus the global search input without changing its current query. */
export function focusSearchInput() {
  if (typeof document === 'undefined') {
    return false
  }

  const input = document.getElementById(SEARCH_INPUT_ID)
  if (!(input instanceof HTMLInputElement)) {
    return false
  }

  input.scrollIntoView({ block: 'center', behavior: 'auto' })
  input.focus({ preventScroll: true })
  input.setSelectionRange(input.value.length, input.value.length)
  return true
}

/** Focus the search input after React has committed a scene change. */
export function focusSearchInputSoon() {
  if (typeof window === 'undefined') {
    return
  }

  window.setTimeout(() => {
    focusSearchInput()
  }, 0)
}
