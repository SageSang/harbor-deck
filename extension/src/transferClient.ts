import type { ExtensionLanguage, ExtensionSettings } from './types'

export const MAX_TRANSFER_BYTES = 5 * 1024 * 1024
export interface TransferImportResult {
  settings: ExtensionSettings
  language: ExtensionLanguage
  languageApplied: boolean
  tokenOmitted: boolean
  draftCount: number
}
export async function transferRequest<T>(
  operation: 'export' | 'import',
  text?: string
): Promise<T> {
  const response = await chrome.runtime.sendMessage({
    type: 'harbordeck:transfer',
    operation,
    text,
  })
  if (
    !response ||
    typeof response !== 'object' ||
    !('ok' in response) ||
    response.ok !== true ||
    !('value' in response)
  ) {
    const error =
      response && typeof response === 'object' && 'error' in response ? response.error : ''
    throw new Error(
      ['invalid-transfer', 'target-not-empty', 'transfer-too-large'].includes(String(error))
        ? String(error)
        : 'transfer-failed'
    )
  }
  return response.value as T
}
