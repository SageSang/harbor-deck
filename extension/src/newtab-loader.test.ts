import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  install: vi.fn(),
  mount: vi.fn(),
  direct: vi.fn(),
}))
vi.mock('./storage', () => ({ readSettings: mocks.settings, readLanguage: async () => 'en' }))
vi.mock('./localRuntime', () => ({ installLocalRuntime: mocks.install }))
vi.mock('./newtab', () => {
  mocks.mount()
  return {}
})
vi.mock('./direct', () => ({ startDirect: mocks.direct }))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  document.body.innerHTML =
    '<form id="harbordeck-search-boot"><input id="harbordeck-search-boot-input"><p id="boot-status" hidden></p><button id="connection-settings" hidden></button></form><div id="root"></div>'
  mocks.settings.mockResolvedValue({ openMode: 'embedded', probeTimeoutMs: 200 })
  mocks.install.mockResolvedValue({})
  vi.stubGlobal('chrome', { runtime: { openOptionsPage: vi.fn() } })
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete window.__harborDeckSearchBoot
})
describe('one-document new tab boot', () => {
  it('mounts the real local app without waiting for any network resolution', async () => {
    await import('./newtab-loader')
    await vi.waitFor(() => expect(mocks.mount).toHaveBeenCalledOnce())
    expect(mocks.install).toHaveBeenCalledOnce()
    expect(mocks.direct).not.toHaveBeenCalled()
    expect(document.querySelector('iframe')).toBeNull()
  })
  it('migrates a legacy direct default but honors a new explicit direct choice', async () => {
    mocks.settings.mockResolvedValue({ openMode: 'direct' })
    await import('./newtab-loader')
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce())
    vi.resetModules()
    mocks.mount.mockClear()
    mocks.settings.mockResolvedValue({ openMode: 'direct', localExperienceVersion: 1 })
    await import('./newtab-loader')
    await vi.waitFor(() => expect(mocks.direct).toHaveBeenCalledOnce())
    expect(mocks.mount).not.toHaveBeenCalled()
  })
  it('keeps input and Enter intent while local settings are loading, without submitting during IME', async () => {
    mocks.settings.mockReturnValue(new Promise(() => undefined))
    await import('./newtab-loader')
    const input = document.querySelector('input')!
    input.dispatchEvent(new Event('compositionstart'))
    input.value = '输入'
    input.dispatchEvent(new Event('input'))
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(window.__harborDeckSearchBoot).toMatchObject({
      value: '输入',
      composing: true,
      pendingSubmit: false,
    })
    input.dispatchEvent(new Event('compositionend'))
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(window.__harborDeckSearchBoot).toMatchObject({ value: '输入', pendingSubmit: true })
  })
  it('leaves an editable recovery shell when storage cannot be read', async () => {
    mocks.settings.mockRejectedValue(new Error('unavailable'))
    await import('./newtab-loader')
    await vi.waitFor(() => expect(document.getElementById('boot-status')?.hidden).toBe(false))
    expect(document.querySelector('input')).not.toBeNull()
  })
})
