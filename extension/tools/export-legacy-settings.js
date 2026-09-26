// Run in the DevTools console of the OLD extension's options page, before changing its ID.
// Read-only: downloads selected settings/drafts; does not alter Chrome storage or send data.
;(async () => {
  if (location.protocol !== 'chrome-extension:' || !chrome.runtime.id) {
    throw new Error('Open the old HarborDeck extension options page first.')
  }
  const settingsKey = 'harborDeckNewTabSettings'
  const sync = await chrome.storage.sync.get([
    settingsKey,
    'smartHarborNewTabSettings',
    'harborDeckNewTabLanguage',
    'smartHarborNewTabLanguage',
  ])
  const local = await chrome.storage.local.get([
    settingsKey,
    'harborDeckPopupDraft',
    'harborDeckPopupDrafts',
    'harborDeckPopupCollapsedScenes',
    'harborDeckExtensionTheme',
  ])
  const settings = local[settingsKey] ?? sync[settingsKey] ?? sync.smartHarborNewTabSettings ?? {}
  const language =
    sync.harborDeckNewTabLanguage ?? sync.smartHarborNewTabLanguage ?? navigator.language
  const file = {
    format: 'harbordeck-extension-transfer',
    version: 1,
    sourceExtensionId: chrome.runtime.id,
    exportedAt: new Date().toISOString(),
    tokenOmitted: Boolean(settings.apiToken),
    settings: {
      primaryUrl: settings.primaryUrl ?? '',
      fallbackUrl: settings.fallbackUrl ?? '',
      openMode: settings.openMode === 'embedded' ? 'embedded' : 'direct',
      probeTimeoutMs: settings.probeTimeoutMs ?? 200,
    },
    language: String(language).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en',
    local: {
      legacyDraft: local.harborDeckPopupDraft ?? null,
      drafts: local.harborDeckPopupDrafts ?? {},
      collapsedScenes: local.harborDeckPopupCollapsedScenes ?? [],
      theme: local.harborDeckExtensionTheme,
    },
  }
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  if (blob.size > 5 * 1024 * 1024)
    throw new Error('Transfer exceeds 5 MB; keep the old installation.')
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'harbordeck-extension-transfer.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  console.info(
    'Transfer file generated without the token. Keep the old installation until verification succeeds.'
  )
})()
