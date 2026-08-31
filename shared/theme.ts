export const APP_SKINS = ['midnight', 'frost', 'ember'] as const

export type AppSkin = (typeof APP_SKINS)[number]

export const DEFAULT_APP_SKIN: AppSkin = 'midnight'
export const WEB_THEME_STORAGE_KEY = 'harborDeckWebTheme'

export function isAppSkin(value: unknown): value is AppSkin {
  return typeof value === 'string' && APP_SKINS.includes(value as AppSkin)
}

export function normalizeAppSkin(value: unknown): AppSkin {
  return isAppSkin(value) ? value : DEFAULT_APP_SKIN
}

export function skinUsesDarkMode(skin: AppSkin): boolean {
  return skin !== 'frost'
}
