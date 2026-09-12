import { createResolutionCoordinator, SettingsChangedError } from './resolutionCoordinator'
import { STORAGE_KEY } from './storage'

const coordinator = createResolutionCoordinator()
const warm = () => {
  void coordinator.refresh({ force: true }).catch(() => undefined)
}
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage()
})
chrome.runtime.onInstalled?.addListener(warm)
chrome.runtime.onStartup?.addListener(warm)
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area !== 'sync' || !(STORAGE_KEY in changes || 'smartHarborNewTabSettings' in changes)) return
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
