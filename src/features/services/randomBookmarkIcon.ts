const randomBookmarkIcons = [
  'bookmark',
  'star',
  'sparkles',
  'layers-2',
  'link-2',
  'rocket',
  'workflow',
  'app-window',
  'globe',
  'layout-dashboard',
  'book-open',
  'code',
  'calendar-days',
  'search',
  'terminal',
  'database',
  'server',
  'folder',
  'house',
  'settings',
  'wrench',
  'heart',
  'circle-dot',
] as const

export function getRandomBookmarkIcon() {
  return randomBookmarkIcons[Math.floor(Math.random() * randomBookmarkIcons.length)]
}
