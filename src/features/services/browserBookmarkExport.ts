import type { NavigationConfig, QuickRecord, ServiceConfig } from '@/config/schema'
import { getPreferredBookmarkCopyUrl } from './bookmarkUrl'

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPE_MAP[character] ?? character)
}

function renderBookmark(bookmark: Pick<ServiceConfig, 'name' | 'primaryUrl' | 'secondaryUrl'>) {
  const url = getPreferredBookmarkCopyUrl(bookmark)
  return `<DT><A HREF="${escapeHtml(url)}">${escapeHtml(bookmark.name)}</A>`
}

function renderQuickRecord(record: Pick<QuickRecord, 'name' | 'primaryUrl' | 'secondaryUrl'>) {
  const url = getPreferredBookmarkCopyUrl(record)
  return `<DT><A HREF="${escapeHtml(url)}">${escapeHtml(record.name)}</A>`
}

/**
 * Serialize one scene into the Netscape Bookmark HTML format understood by
 * Chromium browsers. Scene groups are intentionally kept to one folder level.
 */
export function exportBrowserBookmarksHtml(config: NavigationConfig, sceneId: string) {
  const scene = config.scenes.find((item) => item.id === sceneId)
  if (!scene) {
    throw new Error('导出目标场景不存在')
  }

  const bookmarksById = new Map(config.bookmarks.map((bookmark) => [bookmark.slug, bookmark]))
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ]

  scene.groups.forEach((group) => {
    lines.push(`<DT><H3>${escapeHtml(group.name)}</H3>`)
    lines.push('<DL><p>')

    group.bookmarkIds.forEach((bookmarkId) => {
      const bookmark = bookmarksById.get(bookmarkId)
      if (bookmark) {
        lines.push(renderBookmark(bookmark))
      }
    })

    lines.push('</DL><p>')
  })

  // Quick records do not belong to a group, so keep them as root-level links.
  scene.quickRecords.forEach((record) => lines.push(renderQuickRecord(record)))

  lines.push('</DL><p>')
  return `${lines.join('\n')}\n`
}

