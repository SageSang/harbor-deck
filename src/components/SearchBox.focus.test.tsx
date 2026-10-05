import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { defaultSystemConfig } from '@/config/defaultConfig'

const data = vi.hoisted(() => ({ ready: true }))
vi.mock('@/features/navigation/useNavigation', () => ({
  useNavigationConfig: () => ({ data: data.ready ? {} : undefined }),
}))
vi.mock('@/lib/clientRuntime', async (original) => ({
  ...(await original<typeof import('@/lib/clientRuntime')>()),
  isLocalNewTab: () => true,
}))
vi.mock('@/features/config/useSystemConfig', () => ({
  useSystemConfig: () => ({ data: defaultSystemConfig, isFetched: true }),
}))
vi.mock('@/features/config/useSaveSystemConfig', () => ({ useSaveSystemConfig: () => ({}) }))
vi.mock('@/features/feedback/useFeedback', () => ({ useFeedback: () => ({ showToast: vi.fn() }) }))
let root: Root
let frames: FrameRequestCallback[]
let SearchBox: typeof import('./SearchBox').SearchBox
let store: typeof import('@/store/appStore').useAppStore
const shell = 'harbordeck-search-boot'
const bootId = 'harbordeck-search-boot-input'
const inputId = 'search-box-input'
const bootInput = () => document.getElementById(bootId) as HTMLInputElement
const input = () => document.getElementById(inputId) as HTMLInputElement
async function render() {
  await act(async () => root.render(<SearchBox />))
}
async function flushFrames() {
  const pending = frames.splice(0)
  await act(async () => pending.forEach((frame) => frame(0)))
}
beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  frames = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb))
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  document.body.innerHTML = `<form id="${shell}" style="visibility:hidden"><input id="${bootId}"></form><div id="root"></div><button id="other">Other</button>`
  window.__harborDeckSearchBoot = { value: '', revision: 0, pendingSubmit: false, released: false }
  data.ready = true
  store = (await import('@/store/appStore')).useAppStore
  store.getState().setSearchKeyword('')
  SearchBox = (await import('./SearchBox')).SearchBox
  root = createRoot(document.getElementById('root')!)
})
afterEach(async () => {
  await act(async () => root.unmount())
  delete window.__harborDeckSearchBoot
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('local new-tab search focus and handoff', () => {
  it('focuses the cached formal input without exposing the boot screen', async () => {
    await render()
    expect(document.getElementById(shell)).toBeNull()
    expect(document.activeElement).toBe(input())
    await act(async () => store.getState().setSearchKeyword('early typing'))
    await flushFrames()
    expect(input().value).toBe('early typing')
  })
  it('does not take focus back when data arrives after the user chose another control', async () => {
    await render()
    document.getElementById('other')!.focus()
    data.ready = false
    await render()
    data.ready = true
    await render()
    expect(document.activeElement?.id).toBe('other')
  })
  it('waits for data then transfers text, focus and backward selection from the boot input', async () => {
    data.ready = false
    document.getElementById(shell)!.style.visibility = 'visible'
    bootInput().value = 'typed query'
    window.__harborDeckSearchBoot!.value = 'typed query'
    bootInput().focus()
    bootInput().setSelectionRange(2, 6, 'backward')
    await render()
    await flushFrames()
    expect(document.activeElement).toBe(bootInput())
    data.ready = true
    await render()
    await flushFrames()
    expect(document.activeElement).toBe(input())
    expect([
      input().value,
      input().selectionStart,
      input().selectionEnd,
      input().selectionDirection,
    ]).toEqual(['typed query', 2, 6, 'backward'])
  })
  it('keeps the composing input until composition ends', async () => {
    document.getElementById(shell)!.style.visibility = 'visible'
    window.__harborDeckSearchBoot!.composing = true
    window.__harborDeckSearchBoot!.value = '中文'
    bootInput().value = '中文'
    bootInput().focus()
    await render()
    await flushFrames()
    expect(document.activeElement).toBe(bootInput())
    window.__harborDeckSearchBoot!.composing = false
    await act(async () => window.dispatchEvent(new Event('harbordeck:search-boot-input')))
    await flushFrames()
    expect(document.activeElement).toBe(input())
    expect(input().value).toBe('中文')
  })
  it('does not reclaim focus during handoff when browser chrome has focus', async () => {
    document.getElementById(shell)!.style.visibility = 'visible'
    bootInput().focus()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    await render()
    await flushFrames()
    expect(document.activeElement).not.toBe(input())
  })
})
