import { FormEvent, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Eye, EyeOff } from 'lucide-react'
import { getMessages } from '@extension/i18n'
import { requestOriginPermissions } from '@extension/network'
import {
  DEFAULT_PROBE_TIMEOUT_MS,
  defaultLanguage,
  defaultSettings,
  normalizeProbeTimeoutMs,
  normalizeUrl,
  readLanguage,
  readSettings,
  RESOLUTION_CACHE_TTL_MS,
  writeLanguage,
  writeSettings,
} from '@extension/storage'
import type { ExtensionLanguage, ExtensionSettings, OpenMode } from '@extension/types'
import './styles.css'

const REPOSITORY_URL = 'https://github.com/SageSang/harbor-deck'

function GitHubMarkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.09 3.3 9.4 7.88 10.92.58.11.8-.25.8-.57v-2.02c-3.2.69-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.69-1.28-1.69-1.04-.72.08-.71.08-.71 1.15.08 1.75 1.19 1.75 1.19 1.02 1.76 2.68 1.25 3.33.95.1-.74.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.47.11-3.06 0 0 .97-.31 3.17 1.18a10.97 10.97 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.77.11 3.06.73.81 1.18 1.84 1.18 3.1 0 4.42-2.68 5.39-5.24 5.67.41.36.77 1.06.77 2.15v3.19c0 .31.21.68.81.57a11.53 11.53 0 0 0 7.87-10.92C23.5 5.66 18.35.5 12 .5Z"
      />
    </svg>
  )
}

type SaveStatus =
  | { tone: 'idle'; kind: 'idle' }
  | { tone: 'success'; kind: 'saved' }
  | { tone: 'warn'; kind: 'saved-no-permission' }
  | { tone: 'error'; kind: 'invalid-url' | 'save-failed' }

function getStatusText(language: ExtensionLanguage, status: SaveStatus) {
  const messages = getMessages(language)

  switch (status.kind) {
    case 'idle':
      return messages.options.statusIdle
    case 'saved':
      return messages.options.statusSaved
    case 'saved-no-permission':
      return messages.options.statusSavedNoPermission
    case 'invalid-url':
      return messages.options.statusInvalidUrl
    case 'save-failed':
      return messages.options.statusSaveFailed
  }
}

export function OptionsApp() {
  const [form, setForm] = useState<ExtensionSettings>(defaultSettings)
  const [language, setLanguage] = useState<ExtensionLanguage>(defaultLanguage)
  const [status, setStatus] = useState<SaveStatus>({ tone: 'idle', kind: 'idle' })
  const [saving, setSaving] = useState(false)
  const [showApiToken, setShowApiToken] = useState(false)

  const messages = getMessages(language)
  const cacheDuration =
    RESOLUTION_CACHE_TTL_MS >= 24 * 60 * 60 * 1000
      ? language === 'zh-CN'
        ? `${Math.round(RESOLUTION_CACHE_TTL_MS / (24 * 60 * 60 * 1000))} 天`
        : `${Math.round(RESOLUTION_CACHE_TTL_MS / (24 * 60 * 60 * 1000))} day`
      : `${Math.round(RESOLUTION_CACHE_TTL_MS / 1000)} seconds`

  useEffect(() => {
    document.body.dataset.page = 'options'

    let cancelled = false

    async function load() {
      const [settings, nextLanguage] = await Promise.all([readSettings(), readLanguage()])
      if (!cancelled) {
        setForm(settings)
        setLanguage(nextLanguage)
      }
    }

    void load()

    return () => {
      delete document.body.dataset.page
      cancelled = true
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)

    try {
      const nextSettings: ExtensionSettings = {
        primaryUrl: normalizeUrl(form.primaryUrl),
        fallbackUrl: normalizeUrl(form.fallbackUrl),
        apiToken: form.apiToken.trim(),
        openMode: form.openMode,
        probeTimeoutMs: normalizeProbeTimeoutMs(form.probeTimeoutMs),
      }

      const permissionGranted = await requestOriginPermissions([
        nextSettings.primaryUrl,
        nextSettings.fallbackUrl,
      ])

      await writeSettings(nextSettings)
      try {
        await chrome.runtime.sendMessage({
          type: 'harbordeck:refresh-resolution',
          force: true,
        })
      } catch {
        // The settings are already saved; the next extension startup will
        // rebuild the boot snapshot if the service worker is unavailable.
      }
      setForm(nextSettings)
      setStatus(
        permissionGranted
          ? { tone: 'success', kind: 'saved' }
          : { tone: 'warn', kind: 'saved-no-permission' }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      setStatus({
        tone: 'error',
        kind: message.includes('Invalid URL') ? 'invalid-url' : 'save-failed',
      })
    } finally {
      setSaving(false)
    }
  }

  function updateField<K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function setOpenMode(mode: OpenMode) {
    updateField('openMode', mode)
  }

  async function handleLanguageChange(nextLanguage: ExtensionLanguage) {
    setLanguage(nextLanguage)
    await writeLanguage(nextLanguage)
  }

  return (
    <main className="page-shell settings-layout">
      <section className="settings-card panel">
        <div className="settings-head">
          <div className="settings-head-top">
            <div>
              <div className="eyebrow">HarborDeck Extension</div>
              <h1>{messages.options.title}</h1>
            </div>
            <div className="settings-head-actions">
              <div
                className="language-toggle"
                role="group"
                aria-label={messages.options.languageToggleAriaLabel}
              >
                <button
                  type="button"
                  className={language === 'zh-CN' ? 'active' : ''}
                  onClick={() => void handleLanguageChange('zh-CN')}
                >
                  {messages.options.languageChinese}
                </button>
                <button
                  type="button"
                  className={language === 'en' ? 'active' : ''}
                  onClick={() => void handleLanguageChange('en')}
                >
                  {messages.options.languageEnglish}
                </button>
              </div>
              <a
                href={REPOSITORY_URL}
                target="_blank"
                rel="noreferrer"
                className="icon-link"
                aria-label="GitHub"
                title="GitHub"
              >
                <GitHubMarkIcon />
              </a>
            </div>
          </div>
          <p className="hint">{messages.options.subtitle}</p>
        </div>

        <form className="settings-grid" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="primary-url">{messages.options.primaryUrlLabel}</label>
            <input
              id="primary-url"
              className="input"
              placeholder={messages.options.primaryUrlPlaceholder}
              value={form.primaryUrl}
              onChange={(event) => updateField('primaryUrl', event.target.value)}
            />
            <p className="field-help">{messages.options.primaryUrlHint}</p>
          </div>

          <div className="field">
            <label htmlFor="fallback-url">{messages.options.fallbackUrlLabel}</label>
            <input
              id="fallback-url"
              className="input"
              placeholder={messages.options.fallbackUrlPlaceholder}
              value={form.fallbackUrl}
              onChange={(event) => updateField('fallbackUrl', event.target.value)}
            />
            <p className="field-help">{messages.options.fallbackUrlHint}</p>
          </div>

          <div className="field">
            <label htmlFor="api-token">{language === 'zh-CN' ? '接口 Token' : 'API token'}</label>
            <div className="password-field">
              <input
                id="api-token"
                className="input"
                type={showApiToken ? 'text' : 'password'}
                autoComplete="off"
                placeholder={language === 'zh-CN' ? 'HARBORDECK_SEARCH_TOKEN' : 'HARBORDECK_SEARCH_TOKEN'}
                value={form.apiToken}
                onChange={(event) => updateField('apiToken', event.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showApiToken ? 'Hide token' : 'Show token'}
                title={showApiToken ? 'Hide token' : 'Show token'}
                onClick={() => setShowApiToken((visible) => !visible)}
              >
                {showApiToken ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            </div>
            <p className="field-help">
              {language === 'zh-CN'
                ? '用于插件添加书签和快捷搜索；需与服务端环境变量一致。'
                : 'Used by the extension bookmark action and quick search; must match the server environment variable.'}
            </p>
          </div>

          <div className="field">
            <label>{messages.options.openModeLabel}</label>
            <div
              className="toggle-group"
              role="tablist"
              aria-label={messages.options.openModeAriaLabel}
            >
              <button
                type="button"
                className={`toggle-option ${form.openMode === 'direct' ? 'active' : ''}`}
                onClick={() => setOpenMode('direct')}
              >
                {messages.options.openModeDirect}
              </button>
              <button
                type="button"
                className={`toggle-option ${form.openMode === 'embedded' ? 'active' : ''}`}
                onClick={() => setOpenMode('embedded')}
              >
                {messages.options.openModeEmbedded}
              </button>
            </div>
            <p className="field-help">{messages.options.openModeHint}</p>
          </div>

          <div className="field">
            <label htmlFor="probe-timeout-ms">{messages.options.probeTimeoutLabel}</label>
            <input
              id="probe-timeout-ms"
              type="number"
              min={50}
              max={5000}
              step={50}
              className="input"
              value={form.probeTimeoutMs}
              onChange={(event) => {
                const nextValue = Number(event.target.value)
                updateField(
                  'probeTimeoutMs',
                  Number.isFinite(nextValue) ? nextValue : DEFAULT_PROBE_TIMEOUT_MS
                )
              }}
            />
            <p className="field-help">
              {messages.options.probeTimeoutHint(DEFAULT_PROBE_TIMEOUT_MS, cacheDuration)}
            </p>
          </div>

          <div className="footer-row">
            <div
              className={`status-note ${status.tone === 'success' ? 'success' : ''} ${status.tone === 'error' ? 'error' : ''} ${status.tone === 'warn' ? 'warn' : ''}`}
            >
              {getStatusText(language, status)}
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? messages.options.savingButton : messages.options.saveButton}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<OptionsApp />)
