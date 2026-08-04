/**
 * The new-tab critical path intentionally has no React, CSS bundle, i18n, or
 * network imports. It only reads the small public boot snapshot maintained by
 * the service worker and decides whether to redirect or load the full app.
 */

const BOOT_SNAPSHOT_KEY = 'harborDeckNewTabBootSnapshot'
const SETTINGS_KEY = 'harborDeckNewTabSettings'
const BOOT_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHED_REDIRECT_GRACE_MS = 40
const UNCACHED_REDIRECT_GRACE_MS = 80
const REFRESH_MESSAGE = 'harbordeck:refresh-resolution'

const SHELL_ID = 'harbordeck-instant-shell'
const FORM_ID = 'harbordeck-instant-form'
const INPUT_ID = 'harbordeck-instant-input'
const STATUS_ID = 'harbordeck-instant-status'
const ACTION_ID = 'harbordeck-instant-action'

type OpenMode = 'direct' | 'embedded'
type ResolutionReason =
  | 'primary'
  | 'fallback'
  | 'primary-unverified'
  | 'fallback-unverified'
  | 'unconfigured'

interface BootState {
  primaryUrl: string
  fallbackUrl: string
  openMode: OpenMode
  activeUrl: string
  reason: ResolutionReason
  resolvedAt: number
}

type LoaderWindow = Window & {
  __harborDeckLoaderInstalled?: boolean
  __harborDeckInstantInputValue?: string
  __harborDeckInstantInputActive?: boolean
  __harborDeckBootSnapshot?: BootState
}

function getWindow(): LoaderWindow {
  return window as LoaderWindow
}

function getElements() {
  return {
    shell: document.getElementById(SHELL_ID),
    form: document.getElementById(FORM_ID) as HTMLFormElement | null,
    input: document.getElementById(INPUT_ID) as HTMLInputElement | null,
    status: document.getElementById(STATUS_ID),
    action: document.getElementById(ACTION_ID) as HTMLButtonElement | null,
  }
}

function getInputValue() {
  const { input } = getElements()
  return input?.value ?? getWindow().__harborDeckInstantInputValue ?? ''
}

function setShell(options: {
  visible?: boolean
  paused?: boolean
  status?: string
  actionLabel?: string
  actionDisabled?: boolean
}) {
  const { shell, status, action } = getElements()
  if (!shell) return

  if (options.visible !== undefined) {
    shell.toggleAttribute('hidden', !options.visible)
  }
  shell.classList.toggle('harbordeck-instant-shell-paused', options.paused === true)
  if (status && options.status !== undefined) status.textContent = options.status
  if (action) {
    if (options.actionLabel !== undefined) action.textContent = options.actionLabel
    action.disabled = options.actionDisabled === true
  }
}

function withHandoffQuery(url: string, query: string) {
  const trimmed = query.trim()
  if (!trimmed) return url

  const parsed = new URL(url)
  parsed.searchParams.set('harbordeckQuery', trimmed.slice(0, 2000))
  return parsed.toString()
}

function isReason(value: unknown): value is ResolutionReason {
  return (
    value === 'primary' ||
    value === 'fallback' ||
    value === 'primary-unverified' ||
    value === 'fallback-unverified' ||
    value === 'unconfigured'
  )
}

function normalizeBootState(value: unknown): BootState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (
    typeof record.primaryUrl !== 'string' ||
    typeof record.fallbackUrl !== 'string' ||
    typeof record.activeUrl !== 'string' ||
    (record.openMode !== 'direct' && record.openMode !== 'embedded') ||
    !isReason(record.reason) ||
    typeof record.resolvedAt !== 'number' ||
    !Number.isFinite(record.resolvedAt)
  ) {
    return null
  }

  return {
    primaryUrl: record.primaryUrl,
    fallbackUrl: record.fallbackUrl,
    openMode: record.openMode,
    activeUrl: record.activeUrl,
    reason: record.reason,
    resolvedAt: record.resolvedAt,
  }
}

function normalizeSettings(
  value: unknown
): Pick<BootState, 'primaryUrl' | 'fallbackUrl' | 'openMode'> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.primaryUrl !== 'string' || typeof record.fallbackUrl !== 'string') {
    return null
  }

  return {
    primaryUrl: record.primaryUrl,
    fallbackUrl: record.fallbackUrl,
    openMode: record.openMode === 'embedded' ? 'embedded' : 'direct',
  }
}

async function readBootState(): Promise<BootState | null> {
  try {
    const stored = await chrome.storage.local.get(BOOT_SNAPSHOT_KEY)
    const snapshot = normalizeBootState(stored[BOOT_SNAPSHOT_KEY])
    if (snapshot) {
      return snapshot
    }
  } catch {
    // Fall through to the one-time settings fallback below.
  }

  try {
    const stored = await chrome.storage.sync.get(SETTINGS_KEY)
    const settings = normalizeSettings(stored[SETTINGS_KEY])
    if (!settings) return null
    const activeUrl = settings.primaryUrl || settings.fallbackUrl
    return {
      ...settings,
      activeUrl,
      reason: activeUrl
        ? settings.primaryUrl
          ? 'primary-unverified'
          : 'fallback-unverified'
        : 'unconfigured',
      resolvedAt: 0,
    }
  } catch {
    return null
  }
}

function requestResolutionRefresh() {
  try {
    void chrome.runtime.sendMessage({ type: REFRESH_MESSAGE }).catch(() => undefined)
  } catch {
    // The cached/optimistic target remains usable without the worker.
  }
}

function loadFullNewTabApp() {
  if (document.documentElement.dataset.harborDeckAppLoading === 'true') return
  document.documentElement.dataset.harborDeckAppLoading = 'true'

  const script = document.createElement('script')
  script.type = 'module'
  script.src = new URL('./assets/newtab-app.js', document.baseURI).toString()
  document.head.appendChild(script)
}

let redirectTimer: number | null = null
let redirectStarted = false
let targetUrl = ''

function cancelRedirect() {
  if (redirectStarted) return
  if (redirectTimer !== null) {
    window.clearTimeout(redirectTimer)
    redirectTimer = null
  }
  getWindow().__harborDeckInstantInputActive = true
  setShell({
    visible: true,
    paused: true,
    status: '检测到你正在输入，已暂停自动跳转。',
    actionLabel: '打开导航页',
    actionDisabled: false,
  })
}

function navigate() {
  if (redirectStarted || !targetUrl) return
  redirectStarted = true
  window.location.replace(withHandoffQuery(targetUrl, getInputValue()))
}

function installShellListeners() {
  const { form, input, action } = getElements()
  if (!form || !input) return

  const loaderWindow = getWindow()
  loaderWindow.__harborDeckLoaderInstalled = true
  loaderWindow.__harborDeckInstantInputValue = input.value
  loaderWindow.__harborDeckInstantInputActive = false

  const markInput = () => {
    loaderWindow.__harborDeckInstantInputValue = input.value
    cancelRedirect()
  }

  input.addEventListener('input', markInput, { passive: true })
  input.addEventListener('paste', markInput, { passive: true })
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    loaderWindow.__harborDeckInstantInputValue = input.value
    if (targetUrl) {
      navigate()
    } else {
      void chrome.runtime.openOptionsPage()
    }
  })
  action?.addEventListener('click', (event) => {
    if (!targetUrl) return
    event.preventDefault()
    navigate()
  })
  window.addEventListener('pagehide', () => {
    if (!redirectStarted) cancelRedirect()
  })
}

async function bootstrap() {
  installShellListeners()
  const loaderWindow = getWindow()
  const state = await readBootState()
  if (!state) {
    setShell({
      visible: false,
      status: '',
    })
    loadFullNewTabApp()
    return
  }

  loaderWindow.__harborDeckBootSnapshot = state
  targetUrl = state.activeUrl
  requestResolutionRefresh()

  if (!targetUrl) {
    setShell({ visible: false })
    loadFullNewTabApp()
    return
  }

  if (state.openMode === 'embedded') {
    setShell({ visible: false })
    loadFullNewTabApp()
    return
  }

  if (loaderWindow.__harborDeckInstantInputActive || getInputValue().trim()) {
    cancelRedirect()
    return
  }

  setShell({ visible: true, status: '正在打开导航页…', actionDisabled: true })
  const isFresh = state.resolvedAt > 0 && Date.now() - state.resolvedAt <= BOOT_CACHE_TTL_MS
  redirectTimer = window.setTimeout(
    navigate,
    isFresh ? CACHED_REDIRECT_GRACE_MS : UNCACHED_REDIRECT_GRACE_MS
  )
}

void bootstrap()
