import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { ServiceIcon } from './ServiceIcon'
import { loadIconComponent, preloadServiceIcons } from './iconRegistry'

describe('invalid stored bookmark icons', () => {
  it.each(['constructor', '__proto__', 'toString'])(
    'renders the default icon and safely preloads %s',
    async (name) => {
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
      const host = document.createElement('div')
      const root = createRoot(host)
      try {
        await expect(preloadServiceIcons([name])).resolves.toBe(false)
        await act(async () => root.render(<ServiceIcon name={name} />))
        expect(host.querySelector('svg.lucide-box')).not.toBeNull()
      } finally {
        await act(async () => root.unmount())
        vi.unstubAllGlobals()
      }
    }
  )
})

it.each([
  ['Building2', 'building-2'],
  ['ArrowDownAZ', 'arrow-down-a-z'],
] as const)('renders historical icon %s as its canonical icon', async (label, canonical) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div')
  const root = createRoot(host)
  try {
    await loadIconComponent(canonical)
    await act(async () => root.render(<ServiceIcon name={canonical} autoLoad={false} />))
    const expected = host.innerHTML
    expect(host.querySelector('svg')).not.toBeNull()
    expect(host.querySelector('svg.lucide-box')).toBeNull()
    await act(async () => root.render(<ServiceIcon name={label} autoLoad={false} />))
    expect(host.innerHTML).toBe(expected)
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})
