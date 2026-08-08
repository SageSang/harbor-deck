import { describe, expect, it } from 'vitest'
import {
  bookmarkMatchesAnyUrl,
  getPreferredBookmarkCopyUrl,
  normalizeBookmarkUrl,
} from './bookmarkUrl'

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
    expect(bookmarkMatchesAnyUrl(bookmark, ['https://public.example.com/dashboard#overview'])).toBe(
      true
    )
  })

  it('does not treat two missing secondary URLs as a match', () => {
    expect(
      bookmarkMatchesAnyUrl({ primaryUrl: 'https://first.example.com' }, [
        'https://second.example.com',
        undefined,
      ])
    ).toBe(false)
  })

  it('prefers the secondary URL for copying and falls back to the primary URL', () => {
    expect(
      getPreferredBookmarkCopyUrl({
        primaryUrl: 'http://dashboard.lan',
        secondaryUrl: ' https://dashboard.example.com ',
      })
    ).toBe('https://dashboard.example.com')
    expect(getPreferredBookmarkCopyUrl({ primaryUrl: ' http://dashboard.lan ' })).toBe(
      'http://dashboard.lan'
    )
  })
})
