import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { ServiceCard } from './ServiceCard'
vi.mock('./ServiceIcon', () => ({ ServiceIcon: () => null }))

describe('bookmark browser behavior', () => {
  it('provides a real URL and leaves modified clicks to the browser', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const host = document.createElement('div')
    const root = createRoot(host)
    try {
      await act(async () =>
        root.render(
          <ServiceCard
            service={{
              name: 'Example',
              slug: 'example',
              category: 'Test',
              primaryUrl: '#primary',
              secondaryUrl: '#alternate',
            }}
            networkMode="wan"
            clickOpenTarget="self"
            middleClickOpenTarget="blank"
          />
        )
      )
      const link = host.querySelector('a')!
      expect(link.getAttribute('href')).toBe('#alternate')
      expect(link.target).toBe('_self')
      expect(link.rel).toContain('noopener')
      const click = new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true })
      link.dispatchEvent(click)
      expect(click.defaultPrevented).toBe(false)
    } finally {
      await act(async () => root.unmount())
      vi.unstubAllGlobals()
    }
  })
})
