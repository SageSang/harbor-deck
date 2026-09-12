import { matchesSettings, normalizeResolution } from './resolutionState'
import type { ExtensionSettings, NewTabBootSnapshot } from './types'

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
          settings.probeTimeoutMs + 200
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
      throw new Error('Unable to refresh addresses; settings may have changed')
    }
    const snapshot = normalizeResolution(response.snapshot)
    if (!matchesSettings(snapshot, settings)) throw new Error('Settings changed; reopen this page')
    return snapshot
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}
