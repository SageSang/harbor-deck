interface BookmarkUrls {
  primaryUrl: string
  secondaryUrl?: string
}

export function getPreferredBookmarkCopyUrl(bookmark: BookmarkUrls) {
  return bookmark.secondaryUrl?.trim() || bookmark.primaryUrl.trim()
}

export function normalizeBookmarkUrl(value: string) {
  const parsed = new URL(value.trim())
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, '')
}

export function bookmarkMatchesAnyUrl(
  bookmark: BookmarkUrls,
  candidates: Array<string | undefined>
) {
  const candidateUrls = new Set(
    candidates.filter((value): value is string => Boolean(value?.trim())).map(normalizeBookmarkUrl)
  )

  if (candidateUrls.size === 0) {
    return false
  }

  return [bookmark.primaryUrl, bookmark.secondaryUrl]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeBookmarkUrl)
    .some((value) => candidateUrls.has(value))
}
