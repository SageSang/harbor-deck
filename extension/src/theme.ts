import { skinUsesDarkMode, type AppSkin } from '@shared/theme'
import { readExtensionTheme } from './storage'

const SYNCHRONOUS_THEME_KEY = 'harborDeckExtensionTheme'

export function applyExtensionTheme(skin: AppSkin): void {
  document.documentElement.dataset.skin = skin
  document.documentElement.classList.toggle('dark', skinUsesDarkMode(skin))

  try {
    window.localStorage.setItem(SYNCHRONOUS_THEME_KEY, skin)
  } catch {
    // Chrome storage remains the durable source when localStorage is unavailable.
  }
}

export async function restoreExtensionTheme(): Promise<AppSkin> {
  const skin = await readExtensionTheme()
  applyExtensionTheme(skin)
  return skin
}
