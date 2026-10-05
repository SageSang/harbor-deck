export const APP_SKINS = ['midnight', 'frost', 'ember'] as const

export type AppSkin = (typeof APP_SKINS)[number]

export const DEFAULT_APP_SKIN: AppSkin = 'midnight'
export const WEB_THEME_STORAGE_KEY = 'harborDeckWebTheme'
// Separate deliberate local new-tab choices from pre-1.4.26 server defaults
// that were automatically persisted as if the user had chosen them.
export const LOCAL_NEW_TAB_THEME_STORAGE_KEY = 'harborDeckNewTabTheme'

export function readLocalNewTabSkin(storage: Pick<Storage, 'getItem'>): AppSkin {
  try {
    const stored = storage.getItem(LOCAL_NEW_TAB_THEME_STORAGE_KEY)
    return isAppSkin(stored) ? stored : 'frost'
  } catch {
    return 'frost'
  }
}

export function isAppSkin(value: unknown): value is AppSkin {
  return typeof value === 'string' && APP_SKINS.includes(value as AppSkin)
}

export function normalizeAppSkin(value: unknown): AppSkin {
  return isAppSkin(value) ? value : DEFAULT_APP_SKIN
}

export function skinUsesDarkMode(skin: AppSkin): boolean {
  return skin !== 'frost'
}
