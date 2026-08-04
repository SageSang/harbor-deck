import { describe, expect, it } from 'vitest'
import {
  IMPORTED_BOOKMARK_GROUP_NAME,
  importBrowserBookmarks,
  parseBrowserBookmarksHtml,
} from '@/features/services/browserBookmarkImport'
import type { NavigationConfig } from '@/config/schema'

describe('browserBookmarkImport', () => {
  it('parses grouped browser bookmark html and preserves folder path', () => {
    const html = `
      <!DOCTYPE NETSCAPE-Bookmark-file-1>
      <DL><p>
        <DT><H3>Bookmarks Bar</H3>
        <DL><p>
          <DT><A HREF="https://www.google.com/">Google</A>
          <DT><H3>Dev</H3>
          <DL><p>
            <DT><A HREF="https://github.com/">GitHub</A>
          </DL><p>
        </DL><p>
        <DT><A HREF="https://example.com/root">Root Link</A>
      </DL><p>
    `

    expect(parseBrowserBookmarksHtml(html)).toEqual([
      { name: 'Google', url: 'https://www.google.com/', groupName: 'Bookmarks Bar' },
      { name: 'GitHub', url: 'https://github.com/', groupName: 'Bookmarks Bar / Dev' },
      { name: 'Root Link', url: 'https://example.com/root' },
    ])
  })

  it('imports ungrouped bookmarks into the default imported group', () => {
    const config: NavigationConfig = {
      defaultSceneId: 'default',
      bookmarks: [],
      scenes: [{ id: 'default', name: '默认', protected: false, groups: [], quickRecords: [] }],
    }

    const result = importBrowserBookmarks(
      config,
      [
        { name: 'OpenAI', url: 'https://openai.com/' },
        { name: 'GitHub', url: 'https://github.com/' },
      ],
      'default'
    )

    expect(result.scenes[0].groups).toHaveLength(1)
    expect(result.scenes[0].groups[0].name).toBe(IMPORTED_BOOKMARK_GROUP_NAME)
    expect(result.scenes[0].groups[0].bookmarkIds).toEqual(['openai', 'github'])
    expect(result.bookmarks.map((bookmark) => bookmark.icon)).toEqual([
      expect.any(String),
      expect.any(String),
    ])
  })

  it('creates suffixed import groups for conflicting folder names and reuses default group for ungrouped bookmarks', () => {
    const config: NavigationConfig = {
      defaultSceneId: 'default',
      bookmarks: [
        { slug: 'existing-dev', name: 'Existing Dev', primaryUrl: 'https://existing.example.com/' },
        {
          slug: 'existing-imported',
          name: 'Existing Imported',
          primaryUrl: 'https://imported.example.com/',
        },
      ],
      scenes: [
        {
          id: 'default',
          name: '默认',
          protected: false,
          groups: [
            { id: 'dev', name: 'Dev', bookmarkIds: ['existing-dev'] },
            {
              id: 'imported',
              name: IMPORTED_BOOKMARK_GROUP_NAME,
              bookmarkIds: ['existing-imported'],
            },
          ],
          quickRecords: [],
        },
      ],
    }

    const result = importBrowserBookmarks(
      config,
      [
        { name: 'MDN', url: 'https://developer.mozilla.org/', groupName: 'Dev' },
        { name: 'Node.js', url: 'https://nodejs.org/', groupName: 'Dev' },
        { name: 'OpenAI', url: 'https://openai.com/' },
      ],
      'default'
    )

    expect(result.scenes[0].groups.map((group) => group.name)).toEqual([
      'Dev',
      '导入书签',
      'Dev(导入)',
    ])
    expect(result.scenes[0].groups[1].bookmarkIds).toEqual(['existing-imported', 'openai'])
    expect(result.scenes[0].groups[2].bookmarkIds).toEqual(['mdn', 'nodejs'])
  })

  it('keeps an existing bookmark title when an imported URL has a different title', () => {
    const config: NavigationConfig = {
      defaultSceneId: 'default',
      bookmarks: [
        { slug: 'existing', name: 'Original title', primaryUrl: 'https://same.example.com/' },
      ],
      scenes: [
        {
          id: 'default',
          name: 'Default',
          protected: false,
          groups: [{ id: 'main', name: 'Main', bookmarkIds: ['existing'] }],
          quickRecords: [],
        },
      ],
    }

    const result = importBrowserBookmarks(
      config,
      [{ name: 'Imported title', url: 'https://same.example.com/' }],
      'default'
    )

    expect(result.bookmarks.find((bookmark) => bookmark.slug === 'existing')?.name).toBe(
      'Original title'
    )
  })
})
