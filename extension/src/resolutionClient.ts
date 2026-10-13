import { matchesSettings, normalizeResolution } from './resolutionState'
import type { ExtensionSettings, NewTabBootSnapshot } from './types'

export class ResolutionSettingsChangedError extends Error {}

export function resolutionResponseTimeout(settings: ExtensionSettings) {
  // The worker must wake up and read storage before its network probe begins.
  return Math.max(settings.probeTimeoutMs + 2000, 3000)
}

export async function requestResolution(
  settings: ExtensionSettings,
  options: { force?: boolean; failedUrl?: string; verifySingle?: boolean } = {}
): Promise<NewTabBootSnapshot> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const response = await Promise.race([
      chrome.runtime.sendMessage({ type: 'harbordeck:refresh-resolution', ...options }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Address detection timed out')),
          resolutionResponseTimeout(settings)
        )
      }),
    ])
    if (
      !response ||
      typeof response !== 'object' ||
      !('ok' in response) ||
      !response.ok ||
      !('snapshot' in response)
    ) {
      if (
        response &&
        typeof response === 'object' &&
        'error' in response &&
        response.error === 'settings-changed'
      )
        throw new ResolutionSettingsChangedError('Connection settings changed')
      throw new Error('Unable to refresh addresses')
    }
    const snapshot = normalizeResolution(response.snapshot)
    if (!matchesSettings(snapshot, settings))
      throw new ResolutionSettingsChangedError('Settings changed; reopen this page')
    return snapshot
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}
