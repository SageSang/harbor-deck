export type ExtensionLanguage = 'zh-CN' | 'en'

export type OpenMode = 'embedded' | 'direct'

export interface ExtensionSettings {
  primaryUrl: string
  fallbackUrl: string
  apiToken: string
  openMode: OpenMode
  probeTimeoutMs: number
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
}

export type ResolutionReason =
  'primary' | 'fallback' | 'primary-unverified' | 'fallback-unverified' | 'unconfigured'

export interface ResolvedTarget {
  activeUrl: string
  reason: ResolutionReason
}

export interface ResolutionCache {
  primaryUrl: string
  fallbackUrl: string
  activeUrl: string
  reason: Exclude<ResolutionReason, 'unconfigured'>
  resolvedAt: number
}

/**
 * Public, non-secret startup data kept for the new-tab micro-loader.
 * The API token deliberately never enters this snapshot.
 */
export interface NewTabBootSnapshot {
  primaryUrl: string
  fallbackUrl: string
  openMode: OpenMode
  activeUrl: string
  reason: ResolutionReason
  resolvedAt: number
}
