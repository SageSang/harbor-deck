import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BookmarkCacheView } from './BookmarkCacheView'
import type { BookmarkSnapshot } from './bookmarkSnapshot'
let host: HTMLDivElement, root: Root
const snapshot: BookmarkSnapshot = {
  schemaVersion: 1,
  source: 'https://deck.test/',
  username: 'owner',
  updatedAt: 1,
  scenes: [
    {
      id: 'main',
      name: 'Main',
      groups: [
        {
          id: 'tools',
          name: 'Tools',
          items: [
            { id: 'alpha', name: 'Alpha', primaryUrl: 'https://alpha.test/' },
            { id: 'beta', name: 'Beta', primaryUrl: 'https://beta.test/' },
          ],
        },
      ],
    },
  ],
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
it('preserves search and collapsed groups across a fresh snapshot and removes deleted items', async () => {
  const render = async (next: BookmarkSnapshot) =>
    act(async () =>
      root.render(
        <BookmarkCacheView
          snapshot={next}
          language="en"
          onRefresh={() => undefined}
          onClear={() => undefined}
        />
      )
    )
  await render(snapshot)
  const input = host.querySelector('input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Alpha')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(host.querySelectorAll('article')).toHaveLength(1)
  const details = host.querySelector('details')!
  details.open = false
  await render({ ...snapshot, updatedAt: 2 })
  expect(host.querySelector('input')!.value).toBe('Alpha')
  expect(host.querySelector('details')!.open).toBe(false)
  await render({ ...snapshot, updatedAt: 3, scenes: [] })
  expect(host.querySelectorAll('article')).toHaveLength(0)
  expect(host.textContent).toContain('No ordinary bookmarks')
})
it('renders Chinese read-only actions without external image requests or edit controls', async () => {
  const clear = vi.fn(),
    refresh = vi.fn()
  await act(async () =>
    root.render(<BookmarkCacheView snapshot={snapshot} onClear={clear} onRefresh={refresh} />)
  )
  expect(host.textContent).toContain('本地只读副本')
  expect(host.querySelectorAll('img')).toHaveLength(0)
  await act(async () => host.querySelectorAll('button')[1].click())
  expect(clear).toHaveBeenCalledOnce()
  expect(host.querySelector('a')?.getAttribute('rel')).toBe('noreferrer')
})
