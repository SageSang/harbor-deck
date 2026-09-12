export type ExtensionLanguage = 'zh-CN' | 'en'
export type OpenMode = 'embedded' | 'direct'

export interface ExtensionSettings {
  primaryUrl: string
  fallbackUrl: string
  apiToken: string
  openMode: OpenMode
  probeTimeoutMs: number
  settingsRevision?: string
}

export interface BookmarkSubmission {
  name: string
  primaryUrl: string
  secondaryUrl?: string
  note?: string
  placements: Array<{ sceneId: string; groupId: string }>
  existingBookmarkSlug?: string
  recordSceneId?: string
}

export interface PopupDraft {
  sourceTabUrl: string
  tabUrl: string
  tabTitle: string
  secondaryUrl: string
  note: string
  selectedGroups: Record<string, string>
  recordSceneId?: string
  existingBookmarkSlug?: string
  instanceKey?: string
  pendingSubmission?: BookmarkSubmission
}

export type ResolutionReason =
  | 'primary'
  | 'fallback'
  | 'primary-unverified'
  | 'fallback-unverified'
  | 'unconfigured'
  | 'unreachable'
export type ResolutionStatus = 'success' | 'unverified' | 'failed' | 'unconfigured'

/** Public startup state. Tokens never enter this record. */
export interface NewTabBootSnapshot {
  schemaVersion: 2
  settingsRevision: string
  primaryUrl: string
  fallbackUrl: string
  openMode: OpenMode
  probeTimeoutMs: number
  activeUrl: string
  reason: ResolutionReason
  status: ResolutionStatus
  verifiedAt: number | null
  lastAttemptAt: number
  failedUrls: string[]
  lastSuccessfulUrl: string
  lastSuccessAt: number | null
}

export type ResolutionCache = NewTabBootSnapshot
export type ResolvedTarget = NewTabBootSnapshot
