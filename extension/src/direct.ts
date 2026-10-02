import type { ExtensionSettings } from './types'
import { requestResolution } from './resolutionClient'
/** Explicit compatibility mode. Default local mode never navigates to a remote document. */
export async function startDirect(settings: ExtensionSettings) {
  const status = document.getElementById('boot-status')!
  const retry = document.getElementById('boot-retry') as HTMLButtonElement | null
  document.getElementById('connection-settings')!.hidden = false
  let opening = false
  async function open(force = false) {
    if (opening) return
    opening = true
    if (retry) retry.disabled = true
    try {
      const result = await requestResolution(
        settings,
        force ? { force: true, verifySingle: true } : undefined
      )
      if (!result.activeUrl) throw new Error('Unavailable')
      const navigate = () => {
        const boot = window.__harborDeckSearchBoot
        const target = new URL(result.activeUrl!)
        if (boot?.value) target.searchParams.set('harbordeckQuery', boot.value)
        window.location.replace(target.toString())
      }
      if (window.__harborDeckSearchBoot?.composing) {
        document
          .getElementById('harbordeck-search-boot-input')!
          .addEventListener('compositionend', navigate, { once: true })
      } else navigate()
    } catch {
      status.textContent =
        '暂时无法连接，请重新检测或手动打开 / Connection unavailable; retry or open a link'
      status.hidden = false
    } finally {
      opening = false
      if (retry) retry.disabled = false
    }
  }
  retry?.addEventListener('click', () => void open(true))
  await open()
}
