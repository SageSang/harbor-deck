import { describe, expect, it } from 'vitest'
import type { NavigationConfig } from '@/config/schema'
import { parseBrowserBookmarksHtml } from './browserBookmarkImport'
import { exportBrowserBookmarksHtml } from './browserBookmarkExport'

describe('browserBookmarkExport', () => {
  const config: NavigationConfig = {
    defaultSceneId: 'home',
    bookmarks: [
      {
        slug: 'first',
        name: 'First & Primary',
        primaryUrl: 'http://first.lan/?from=home&mode=1',
        secondaryUrl: 'https://first.example.com/?from=home&mode=1',
      },
      {
        slug: 'second',
        name: 'Second <Tool>',
        primaryUrl: 'https://second.example.com/',
      },
    ],
    scenes: [
      {
        id: 'home',
        name: 'Home',
        protected: false,
        groups: [
          { id: 'dev', name: 'Dev & Ops', bookmarkIds: ['first'] },
          { id: 'empty', name: 'Empty Group', bookmarkIds: [] },
          { id: 'tools', name: 'Tools', bookmarkIds: ['second'] },
        ],
        quickRecords: [
          {
            id: 'quick-1',
            name: 'Quick "Record"',
            primaryUrl: 'http://quick.lan',
            secondaryUrl: 'https://quick.example.com',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    ],
  }

  it('preserves group order, empty groups, preferred URLs, and root quick records', () => {
    const html = exportBrowserBookmarksHtml(config, 'home')

    expect(html.indexOf('<H3>Dev &amp; Ops</H3>')).toBeLessThan(
      html.indexOf('<H3>Empty Group</H3>')
    )
    expect(html.indexOf('<H3>Empty Group</H3>')).toBeLessThan(html.indexOf('<H3>Tools</H3>'))
    expect(html).toContain(
      '<DT><A HREF="https://first.example.com/?from=home&amp;mode=1">First &amp; Primary</A>'
    )
    expect(html).toContain('<DT><A HREF="https://second.example.com/">Second &lt;Tool&gt;</A>')
    expect(html).toContain(
      '<DT><A HREF="https://quick.example.com">Quick &quot;Record&quot;</A>'
    )
    expect(html.indexOf('Quick &quot;Record&quot;')).toBeGreaterThan(html.indexOf('</DL><p>'))
    expect(html).toContain('<DT><H3>Empty Group</H3>\n<DL><p>\n</DL><p>')
  })

  it('round-trips through the browser bookmark importer with one-level groups', () => {
    const imported = parseBrowserBookmarksHtml(exportBrowserBookmarksHtml(config, 'home'))

    expect(imported).toEqual([
      {
        name: 'First & Primary',
        url: 'https://first.example.com/?from=home&mode=1',
        groupName: 'Dev & Ops',
      },
      { name: 'Second <Tool>', url: 'https://second.example.com/', groupName: 'Tools' },
      { name: 'Quick "Record"', url: 'https://quick.example.com' },
    ])
  })

  it('throws when the scene does not exist', () => {
    expect(() => exportBrowserBookmarksHtml(config, 'missing')).toThrow('导出目标场景不存在')
  })
})

