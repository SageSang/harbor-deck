import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { startDirect } from './direct'
import { requestResolution } from './resolutionClient'
import { emptyResolution } from './resolutionState'
import type { ExtensionSettings } from './types'
vi.mock('./resolutionClient', () => ({ requestResolution: vi.fn() }))
const settings: ExtensionSettings = {
  primaryUrl: 'https://deck.test/',
  fallbackUrl: '',
  apiToken: '',
  openMode: 'direct',
  probeTimeoutMs: 1000,
  localExperienceVersion: 1,
}
let replace: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  replace = vi.fn()
  vi.stubGlobal('window', {
    location: { replace },
    __harborDeckSearchBoot: {
      value: 'half written',
      released: false,
      revision: 1,
      pendingSubmit: false,
      composing: false,
    },
  })
  document.body.innerHTML =
    '<p id="boot-status" hidden></p><button id="boot-retry"></button><button id="connection-settings"></button><input id="harbordeck-search-boot-input">'
})
afterEach(() => vi.unstubAllGlobals())
it('preserves typed text in explicit direct navigation', async () => {
  vi.mocked(requestResolution).mockResolvedValue({
    ...emptyResolution(settings),
    activeUrl: settings.primaryUrl,
  })
  await startDirect(settings)
  expect(new URL(replace.mock.calls[0][0]).searchParams.get('harbordeckQuery')).toBe('half written')
  expect(replace).toHaveBeenCalledOnce()
})
it('waits for composition end and transfers the final text', async () => {
  window.__harborDeckSearchBoot!.composing = true
  vi.mocked(requestResolution).mockResolvedValue({
    ...emptyResolution(settings),
    activeUrl: settings.primaryUrl,
  })
  await startDirect(settings)
  expect(replace).not.toHaveBeenCalled()
  window.__harborDeckSearchBoot!.value = '完整输入'
  document.querySelector('input')!.dispatchEvent(new Event('compositionend'))
  expect(new URL(replace.mock.calls[0][0]).searchParams.get('harbordeckQuery')).toBe('完整输入')
})
it('offers a bounded explicit retry after a failed check without clearing text', async () => {
  vi.mocked(requestResolution)
    .mockRejectedValueOnce(new Error('worker unavailable'))
    .mockResolvedValueOnce({ ...emptyResolution(settings), activeUrl: settings.primaryUrl })
  await startDirect(settings)
  expect(document.getElementById('boot-status')?.hidden).toBe(false)
  document.getElementById('boot-retry')!.click()
  await vi.waitFor(() => expect(replace).toHaveBeenCalledOnce())
  expect(requestResolution).toHaveBeenLastCalledWith(settings, { force: true, verifySingle: true })
  expect(window.__harborDeckSearchBoot?.value).toBe('half written')
})
