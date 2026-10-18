import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { ServiceIcon } from './ServiceIcon'
import { preloadServiceIcons } from './iconRegistry'

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
