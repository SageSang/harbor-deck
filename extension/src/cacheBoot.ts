import type { BookmarkSnapshot } from '@shared/bookmarkSnapshot'
import type { ExtensionSettings } from './types'
export interface CacheBoot {
  settings: ExtensionSettings
  snapshot?: BookmarkSnapshot
  query: string
  paused: boolean
}
declare global {
  interface Window {
    __harborDeckCacheBoot?: CacheBoot
  }
}
