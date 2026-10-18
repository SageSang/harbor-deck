import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { IconPicker } from './IconPicker'

// Keep the real catalog and selection flow; observe the identity sent to each thumbnail.
vi.mock('@/features/services/ServiceIcon', () => ({
  ServiceIcon: ({ name }: { name?: string }) => <span data-icon-name={name} />,
}))

it.each([
  ['Building2', 'building-2'],
  ['ArrowDownAZ', 'arrow-down-a-z'],
])('renders and selects the canonical key for the %s candidate', async (label, canonical) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const select = vi.fn()
  try {
    await act(async () => root.render(<IconPicker value={label} onChange={select} />))
    await act(async () => host.querySelector('button')!.click())
    const search = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, label)
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const option = Array.from(document.querySelectorAll('[role="dialog"] button')).find((button) =>
      button.textContent?.includes(canonical)
    ) as HTMLButtonElement
    expect(option).toBeTruthy()
    expect(option.querySelector('[data-icon-name]')?.getAttribute('data-icon-name')).toBe(canonical)
    await act(async () => option.click())
    expect(select).toHaveBeenCalledOnce()
    expect(select).toHaveBeenCalledWith(canonical)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})
