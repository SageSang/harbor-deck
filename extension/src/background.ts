import { createResolutionCoordinator, SettingsChangedError } from './resolutionCoordinator'
import { STORAGE_KEY } from './storage'
import { createSettingsCoordinator } from './settingsCoordinator'
import type { ExtensionSettings } from './types'
import { createTransferService, TransferError } from './transfer'

const connections = createSettingsCoordinator()
const transfer = createTransferService(connections)
const coordinator = createResolutionCoordinator(connections.read)
const warm = () => {
  void coordinator.refresh({ force: true }).catch(() => undefined)
}
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage()
})
chrome.runtime.onInstalled?.addListener(warm)
chrome.runtime.onStartup?.addListener(warm)
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area !== 'local' || !(STORAGE_KEY in changes)) return
  coordinator.invalidate()
  warm()
})
const permissionsChanged = () => {
  coordinator.invalidate()
  warm()
}
chrome.permissions.onRemoved?.addListener(permissionsChanged)
chrome.permissions.onAdded?.addListener(permissionsChanged)

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    message &&
    typeof message === 'object' &&
    'type' in message &&
    message.type === 'harbordeck:transfer'
  ) {
    const request = message as { operation?: string; text?: string }
    const result: Promise<unknown> =
      request.operation === 'export'
        ? transfer.export()
        : request.operation === 'import' && typeof request.text === 'string'
          ? transfer.import(request.text)
          : Promise.reject(new TransferError('invalid-transfer'))
    void result
      .then((value) => sendResponse({ ok: true, value }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof TransferError ? error.code : 'transfer-failed',
        })
      )
    return true
  }
  if (
    message &&
    typeof message === 'object' &&
    'type' in message &&
    message.type === 'harbordeck:connection-settings'
  ) {
    const request = message as { operation?: string; settings?: ExtensionSettings }
    const result =
      request.operation === 'read'
        ? connections.read()
        : request.operation === 'save' && request.settings
          ? connections.save(request.settings)
          : Promise.reject(new Error('Invalid settings operation'))
    void result
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch(() => sendResponse({ ok: false, error: 'settings-unavailable' }))
    return true
  }
  if (
    !message ||
    typeof message !== 'object' ||
    !('type' in message) ||
    message.type !== 'harbordeck:refresh-resolution'
  )
    return
  const options = message as { force?: boolean; failedUrl?: unknown; verifySingle?: boolean }
  void coordinator
    .refresh({
      force: options.force === true,
      verifySingle: options.verifySingle === true,
      failedUrl: typeof options.failedUrl === 'string' ? options.failedUrl : undefined,
    })
    .then((snapshot) => sendResponse({ ok: true, snapshot }))
    .catch((error: unknown) =>
      sendResponse({
        ok: false,
        error: error instanceof SettingsChangedError ? 'settings-changed' : 'resolution-failed',
      })
    )
  return true
})
