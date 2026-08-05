import { describe, expect, it } from 'vitest'
import { bookmarkMatchesAnyUrl, normalizeBookmarkUrl } from './bookmarkUrl'

describe('bookmark URL matching', () => {
  it('normalizes fragments and trailing slashes', () => {
    expect(normalizeBookmarkUrl('https://example.com/path/#section')).toBe(
      'https://example.com/path'
    )
  })

  it('matches a primary or secondary URL', () => {
    const bookmark = {
      primaryUrl: 'https://internal.example.com/',
      secondaryUrl: 'https://public.example.com/dashboard',
    }

    expect(bookmarkMatchesAnyUrl(bookmark, ['https://internal.example.com'])).toBe(true)
    expect(
      bookmarkMatchesAnyUrl(bookmark, ['https://public.example.com/dashboard#overview'])
    ).toBe(true)
  })

  it('does not treat two missing secondary URLs as a match', () => {
    expect(
      bookmarkMatchesAnyUrl(
        { primaryUrl: 'https://first.example.com' },
        ['https://second.example.com', undefined]
      )
    ).toBe(false)
  })
})
