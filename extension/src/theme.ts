import { skinUsesDarkMode, type AppSkin } from '@shared/theme'
import { fetchRemoteTheme } from '@extension/network'
import { readExtensionTheme, writeExtensionTheme } from '@extension/storage'

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

export async function syncExtensionTheme(
  baseUrl: string,
  apiToken: string,
  timeoutMs?: number
): Promise<AppSkin | null> {
  const skin = await fetchRemoteTheme(baseUrl, apiToken, timeoutMs)
  if (!skin) return null

  applyExtensionTheme(skin)
  await writeExtensionTheme(skin)
  return skin
}
