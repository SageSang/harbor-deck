import { readSettings, readLanguage } from './storage'
import { installLocalRuntime } from './localRuntime'
import {
  SEARCH_BOOT_INPUT_EVENT,
  SEARCH_BOOT_INPUT_ID,
  SEARCH_BOOT_SHELL_ID,
  type SearchBootState,
} from '@/components/searchBoot'

const input = document.getElementById(SEARCH_BOOT_INPUT_ID) as HTMLInputElement
const form = document.getElementById(SEARCH_BOOT_SHELL_ID) as HTMLFormElement
const boot: SearchBootState = (window.__harborDeckSearchBoot = {
  value: input.value,
  revision: 0,
  pendingSubmit: false,
  released: false,
  composing: false,
})
const publish = () => {
  boot.value = input.value
  boot.revision++
  window.dispatchEvent(new Event(SEARCH_BOOT_INPUT_EVENT))
}
input.addEventListener('input', publish)
input.addEventListener('compositionstart', () => {
  boot.composing = true
})
input.addEventListener('compositionend', () => {
  boot.composing = false
  publish()
})
form.addEventListener('submit', (event) => {
  event.preventDefault()
  if (!boot.composing) {
    boot.pendingSubmit = true
    publish()
  }
})
async function start() {
  const [settings, language] = await Promise.all([
    readSettings(),
    readLanguage().catch(() => (navigator.language.startsWith('zh') ? 'zh-CN' : 'en')),
  ])
  try {
    if (!localStorage.getItem('harbordeck-language'))
      localStorage.setItem('harbordeck-language', language)
  } catch {
    /* Optional preference */
  }
  const addresses = document.getElementById('boot-addresses')
  for (const url of [settings.primaryUrl, settings.fallbackUrl].filter(Boolean)) {
    const link = document.createElement('a')
    link.href = url
    link.textContent = url
    link.style.display = 'block'
    addresses?.appendChild(link)
  }
  // Legacy installations move once to local rendering; an explicit new direct choice is retained.
  if (settings.openMode === 'direct' && settings.localExperienceVersion === 1) {
    form.style.visibility = 'visible'
    const { startDirect } = await import('./direct')
    await startDirect(settings)
    return
  }
  const runtime = await installLocalRuntime(settings)
  if (!runtime.snapshot) form.style.visibility = 'visible'
  await import('./newtab')
}
void start().catch(() => {
  form.style.visibility = 'visible'
  const status = document.getElementById('boot-status')!
  status.textContent = '无法读取本机设置，请打开扩展设置后重试 / Unable to read local settings'
  status.hidden = false
  document.getElementById('connection-settings')!.hidden = false
})
document
  .getElementById('connection-settings')!
  .addEventListener('click', () => void chrome.runtime.openOptionsPage())

document
  .getElementById('boot-retry')
  ?.addEventListener('click', () =>
    window.dispatchEvent(new Event('harbordeck-bookmark-cache-refresh'))
  )
