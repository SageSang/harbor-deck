/** Lightweight local shell: no React, CSS bundle or direct network imports. */
import { createNewTabController, type PauseReason } from './newtabController'
import {
  readLanguage,
  readResolutionCache,
  readSettings,
  EXTENSION_THEME_STORAGE_KEY,
  NEW_TAB_BOOT_SNAPSHOT_KEY,
  STORAGE_KEY,
} from './storage'
import {
  matchesSettings,
  normalizeResolution,
  MANUAL_CACHE_TTL_MS,
  emptyResolution,
} from './resolutionState'
import type { ExtensionLanguage, ExtensionSettings, NewTabBootSnapshot } from './types'

declare global {
  interface Window {
    __harborDeckBootSnapshot?: NewTabBootSnapshot
  }
}
let language: ExtensionLanguage = navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
const zh = () => language === 'zh-CN'
const shell = document.getElementById('harbordeck-instant-shell')!
const form = document.getElementById('harbordeck-instant-form') as HTMLFormElement
const input = document.getElementById('harbordeck-instant-input') as HTMLInputElement
const status = document.getElementById('harbordeck-instant-status')!
const action = document.getElementById('harbordeck-instant-action') as HTMLButtonElement
const links = document.createElement('div')
links.className = 'harbordeck-manual-links'
form.appendChild(links)
let controller: ReturnType<typeof createNewTabController> | null = null
let settings: ExtensionSettings | null = null
let cancelled: PauseReason | null =
  document.visibilityState === 'hidden' ? 'hidden' : navigator.onLine === false ? 'offline' : null
let selected: NewTabBootSnapshot | null = null
let published: NewTabBootSnapshot | null = null
let navigationStarted = false
let skin = 'midnight'

function applyTheme(value: unknown) {
  if (value !== 'midnight' && value !== 'frost' && value !== 'ember') return
  skin = value
  document.documentElement.dataset.skin = value
  document.documentElement.classList.toggle('dark', value !== 'frost')
  try {
    localStorage.setItem(EXTENSION_THEME_STORAGE_KEY, value)
  } catch {
    /* Optional synchronous cache. */
  }
}
try {
  applyTheme(localStorage.getItem(EXTENSION_THEME_STORAGE_KEY))
} catch {
  /* Optional. */
}
void chrome.storage.local
  .get(EXTENSION_THEME_STORAGE_KEY)
  .then((stored) => applyTheme(stored[EXTENSION_THEME_STORAGE_KEY]))
  .catch(() => undefined)

function withHandoff(url: string) {
  const parsed = new URL(url)
  parsed.searchParams.set('harbordeckSkin', skin)
  if (input.value.trim())
    parsed.searchParams.set('harbordeckQuery', input.value.trim().slice(0, 2000))
  return parsed.toString()
}
function navigate(snapshot: NewTabBootSnapshot, manual = false) {
  if (navigationStarted || (!manual && cancelled) || !snapshot.activeUrl) return
  navigationStarted = true
  controller?.dispose()
  if (snapshot.openMode === 'embedded') {
    window.__harborDeckBootSnapshot = { ...snapshot, activeUrl: withHandoff(snapshot.activeUrl) }
    shell.hidden = true
    const stylesheet = document.createElement('link')
    stylesheet.rel = 'stylesheet'
    stylesheet.href = new URL('./assets/styles.css', document.baseURI).toString()
    document.head.appendChild(stylesheet)
    const script = document.createElement('script')
    script.type = 'module'
    script.src = new URL('./assets/newtab-app.js', document.baseURI).toString()
    script.onerror = () => {
      navigationStarted = false
      shell.hidden = false
      pause('failed')
    }
    document.head.appendChild(script)
  } else window.location.replace(withHandoff(snapshot.activeUrl))
}
function pause(reason: PauseReason) {
  cancelled ??= reason
  controller?.pause(reason)
  render(selected, cancelled)
}
function render(snapshot: NewTabBootSnapshot | null, paused: PauseReason | null) {
  selected = snapshot
  const reason = cancelled ?? paused
  shell.classList.toggle('harbordeck-instant-shell-paused', Boolean(reason))
  const texts: Record<PauseReason, [string, string]> = {
    input: ['检测到输入，已暂停自动打开。', 'Typing detected. Automatic opening is paused.'],
    hidden: [
      '已暂停自动打开，请选择地址继续。',
      'Automatic opening is paused. Choose an address to continue.',
    ],
    offline: ['当前离线。恢复网络后可重新检测。', 'You are offline. Check again when connected.'],
    deadline: [
      '检测已超时，请重新检测或手动打开。',
      'Detection timed out. Check again or open an address manually.',
    ],
    failed: [
      '暂时无法验证可用地址，请重新检测或手动打开。',
      'No address is verified as available. Check again or open manually.',
    ],
    unconfigured: ['请先配置导航页地址。', 'Configure your navigation addresses first.'],
  }
  status.textContent =
    reason && snapshot?.status === 'success' && (reason === 'failed' || reason === 'deadline')
      ? zh()
        ? '已检测到可用地址，请选择入口继续。'
        : 'An address is available. Choose an entry to continue.'
      : reason
        ? texts[reason][zh() ? 0 : 1]
        : snapshot?.status === 'unverified'
          ? zh()
            ? '地址尚未验证，正在尝试打开…'
            : 'Address is unverified. Opening…'
          : zh()
            ? '正在打开导航页…'
            : 'Opening HarborDeck…'
  input.placeholder = zh() ? '搜索词或网址' : 'Search or enter a URL'
  action.textContent =
    settings?.primaryUrl || settings?.fallbackUrl
      ? zh()
        ? '打开导航页'
        : 'Open HarborDeck'
      : zh()
        ? '打开设置'
        : 'Open settings'
  action.disabled = false
  links.replaceChildren()
  if (!reason) return
  const urls = new Set(
    [snapshot?.activeUrl, settings?.primaryUrl, settings?.fallbackUrl].filter(
      (url): url is string => Boolean(url)
    )
  )
  if (snapshot?.lastSuccessAt && Date.now() - snapshot.lastSuccessAt <= MANUAL_CACHE_TTL_MS)
    urls.add(snapshot.lastSuccessfulUrl)
  for (const url of urls) {
    const link = document.createElement('a')
    link.href = url
    link.textContent = url
    link.addEventListener('click', (event) => {
      event.preventDefault()
      if (settings) navigate({ ...(snapshot ?? baseSnapshot(settings)), activeUrl: url }, true)
    })
    links.appendChild(link)
  }
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.textContent = zh() ? '重新检测' : 'Check again'
  retry.addEventListener('click', () => {
    void refresh(true)
  })
  links.appendChild(retry)
  const configure = document.createElement('button')
  configure.type = 'button'
  configure.textContent = zh() ? '设置' : 'Settings'
  configure.addEventListener('click', () => {
    void chrome.runtime.openOptionsPage()
  })
  links.appendChild(configure)
}
function baseSnapshot(value: ExtensionSettings) {
  return emptyResolution(value)
}
async function refresh(manual = false) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'harbordeck:refresh-resolution',
      force: true,
      verifySingle: manual,
    })
    if (!response || typeof response !== 'object' || !('snapshot' in response) || !settings) return
    const next = normalizeResolution(response.snapshot)
    const current = await readSettings()
    if (!matchesSettings(next, current) || !matchesSettings(next, settings)) {
      pause('failed')
      return
    }
    controller?.accept(next)
  } catch {
    if (manual) render(selected, cancelled ?? 'failed')
  }
}
for (const event of [
  'input',
  'keydown',
  'beforeinput',
  'compositionstart',
  'paste',
  'pointerdown',
]) {
  input.addEventListener(event, () => pause('input'), { passive: true })
}
chrome.storage.onChanged?.addListener((changes, area) => {
  if (navigationStarted) return
  if (area === 'sync' && STORAGE_KEY in changes && settings) {
    pause('failed')
    return
  }
  if (area !== 'local') return
  const change = changes[NEW_TAB_BOOT_SNAPSHOT_KEY]
  if (!change || typeof change !== 'object' || !('newValue' in change)) return
  const snapshot = normalizeResolution(change.newValue)
  if (snapshot && settings && matchesSettings(snapshot, settings)) {
    published = snapshot
    // The controller may already be waiting for the last asynchronous storage
    // check. A failure observed during that wait must still cancel navigation.
    if (snapshot.status === 'failed' || snapshot.failedUrls.includes(snapshot.activeUrl)) {
      selected = snapshot
      pause('failed')
    } else controller?.accept(snapshot)
  }
})
window.addEventListener('offline', () => pause('offline'))
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pause('hidden')
})
window.addEventListener('pagehide', () => pause('hidden'))
form.addEventListener('submit', (event) => {
  event.preventDefault()
  if (!settings || (!settings.primaryUrl && !settings.fallbackUrl)) {
    void chrome.runtime.openOptionsPage()
    return
  }
  navigate(
    {
      ...(selected ?? baseSnapshot(settings)),
      activeUrl: selected?.activeUrl || settings.primaryUrl || settings.fallbackUrl,
    },
    true
  )
})

async function bootstrap() {
  const [current, initial, nextLanguage] = await Promise.all([
    readSettings(),
    readResolutionCache(),
    readLanguage(),
  ])
  settings = current
  language = nextLanguage
  const target = matchesSettings(initial, current)
    ? initial.activeUrl
    : current.primaryUrl || current.fallbackUrl
  if (target) {
    const link = document.createElement('link')
    link.rel = 'preconnect'
    link.href = new URL(target).origin
    document.head.appendChild(link)
  }
  const decisionDeadline = Date.now() + current.probeTimeoutMs + 200
  controller = createNewTabController({
    settings: current,
    initial,
    navigate: (snapshot) => {
      const remaining = decisionDeadline - Date.now()
      if (remaining <= 0) {
        pause('deadline')
        return
      }
      const checkTimer = window.setTimeout(() => pause('deadline'), remaining)
      void Promise.all([readSettings(), readResolutionCache()])
        .then(([latestSettings, latestSnapshot]) => {
          if (!matchesSettings(snapshot, latestSettings)) {
            pause('failed')
            return
          }
          const storedCandidate =
            matchesSettings(latestSnapshot, latestSettings) &&
            latestSnapshot.lastAttemptAt >= snapshot.lastAttemptAt
              ? latestSnapshot
              : snapshot
          const candidate =
            matchesSettings(published, latestSettings) &&
            published.lastAttemptAt >= storedCandidate.lastAttemptAt
              ? published
              : storedCandidate
          if (candidate.status === 'failed' || candidate.failedUrls.includes(candidate.activeUrl)) {
            selected = candidate
            pause('failed')
          } else navigate(candidate)
        })
        .catch(() => pause('failed'))
        .finally(() => window.clearTimeout(checkTimer))
    },
    changed: render,
  })
  if (cancelled) controller.pause(cancelled)
  void refresh()
}
void bootstrap().catch(() => {
  pause('failed')
})
