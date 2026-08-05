import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openWithFallback } from '@/core/navigation/openWithFallback'

describe('openWithFallback', () => {
  const openMock = vi.fn()
  const assignMock = vi.fn()
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'open').mockImplementation(openMock)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        assign: assignMock,
      } as unknown as Location,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('opens primary url in a new tab when no fallback exists', async () => {
    const popup = {
      closed: false,
      opener: window,
      focus: vi.fn(),
      location: {
        replace: vi.fn(),
      },
    } as unknown as Window

    openMock.mockReturnValueOnce(popup)

    await openWithFallback({ primary: 'https://example.com' }, { target: 'blank' })

    expect(openMock).toHaveBeenCalledWith('', '_blank')
    expect(popup.location.replace).toHaveBeenCalledWith('https://example.com')
  })

  it('always opens primary url even when fallback exists', async () => {
    const popup = {
      closed: false,
      opener: window,
      focus: vi.fn(),
      location: {
        replace: vi.fn(),
      },
    } as unknown as Window

    openMock.mockReturnValueOnce(popup)

    await openWithFallback(
      {
        primary: 'https://example.com',
        fallback: 'https://fallback.example.com',
      },
      { target: 'blank' }
    )

    expect(popup.location.replace).toHaveBeenCalledWith('https://example.com')
  })

  it('opens primary url in current tab for self target', async () => {
    await openWithFallback(
      {
        primary: 'https://example.com',
        fallback: 'https://fallback.example.com',
      },
      { target: 'self' }
    )

    expect(assignMock).toHaveBeenCalledWith('https://example.com')
  })

  it.each(['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd'])(
    'refuses to open unsupported URL %s',
    async (url) => {
      await openWithFallback({ primary: url }, { target: 'blank' })

      expect(openMock).not.toHaveBeenCalled()
      expect(assignMock).not.toHaveBeenCalled()
    }
  )
})
