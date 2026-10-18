import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CategoryPicker } from './CategoryPicker'
import { filterCategoryScenes, invalidCategoryTargets, type SceneOption } from './categoryOptions'
const scenes: SceneOption[] = [
  {
    id: 'home',
    name: 'Home',
    groups: [
      { id: 'mail', name: '账号｜邮箱' },
      { id: 'dev', name: '开发｜工具' },
    ],
  },
  {
    id: 'work',
    name: 'Work',
    groups: [
      { id: 'test', name: '测试｜工具' },
      { id: 'mail', name: '账号｜邮箱' },
    ],
  },
]
let host: HTMLDivElement, root: Root
const select = vi.fn()
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  select.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
async function render(selected = {}) {
  await act(async () =>
    root.render(<CategoryPicker scenes={scenes} selected={selected} isZh onSelect={select} />)
  )
}
async function input(value: string) {
  await act(async () => {
    const el = host.querySelector('input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
it('filters complete paths case-insensitively with AND words and preserves server order', () => {
  expect(filterCategoryScenes(scenes, '  wOrK   测试 ')[0].groups.map((g) => g.id)).toEqual([
    'test',
  ])
  expect(filterCategoryScenes(scenes, '邮箱').map((s) => s.id)).toEqual(['home', 'work'])
  expect(filterCategoryScenes(scenes, '  ')).toBe(scenes)
  expect(filterCategoryScenes(scenes, 'unknown')).toEqual([])
  expect(invalidCategoryTargets(scenes, { home: 'deleted', work: 'test', gone: 'x' })).toEqual([
    ['home', 'deleted'],
    ['gone', 'x'],
  ])
})
it('automatically shows matches without changing the selection', async () => {
  await render({ home: 'mail', work: 'test' })
  await input('邮箱')
  expect(host.querySelectorAll('[data-category-option]')).toHaveLength(2)
  expect(host.querySelector('[data-category-option]')?.getAttribute('aria-pressed')).toBe('true')
  expect(select).not.toHaveBeenCalled()
  await input('Work 测试')
  expect(host.textContent).not.toContain('Home')
  expect(host.querySelector('[data-category-option]')?.getAttribute('aria-pressed')).toBe('true')
})
it('restores browsing expansion after a search is cleared', async () => {
  await render()
  await act(async () => host.querySelector<HTMLButtonElement>('.popup-scene-heading')!.click())
  await input('Work')
  await act(async () => host.querySelector<HTMLButtonElement>('.popup-scene-heading')!.click())
  await input('')
  expect(host.querySelectorAll('[data-category-option]')).toHaveLength(2)
  expect(host.querySelector('[data-category-option]')?.textContent).toContain('Home')
})
it('supports arrows, Enter selection, Escape clearing and IME safety', async () => {
  await render()
  await input('邮箱')
  const search = host.querySelector('input')!
  search.focus()
  await act(async () =>
    search.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        isComposing: true,
      })
    )
  )
  expect(select).not.toHaveBeenCalled()
  await act(async () =>
    search.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
  )
  expect(select).toHaveBeenLastCalledWith('home', 'mail')
  await act(async () =>
    search.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    )
  )
  expect(document.activeElement?.textContent).toContain('Home')
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    )
  )
  expect(document.activeElement?.textContent).toContain('Work')
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  )
  expect(search.value).toBe('')
  expect(document.activeElement).toBe(search)
})
it('renders an explicit empty result without inventing a destination', async () => {
  await render()
  await input('不存在')
  expect(host.querySelector('[role="status"]')?.textContent).toContain('没有匹配')
  expect(select).not.toHaveBeenCalled()
})
