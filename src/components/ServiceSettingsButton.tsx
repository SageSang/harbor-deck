import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Download,
  FileJson,
  Globe,
  KeyRound,
  Languages,
  MoonStar,
  Plus,
  RefreshCcw,
  Save,
  Settings2,
  Sun,
  Trash2,
  Upload,
  Wifi,
  WandSparkles,
} from 'lucide-react'
import {
  buildNetworkProbeUrl,
  hasCompleteNetworkProbeConfig,
  NETWORK_PROBE_PATH,
} from '@/config/networkProbe'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfigPanelLayout, ConfigPanelSection } from '@/components/ConfigPanelLayout'
import { ModalShell } from '@/components/ModalShell'
import {
  SEARCH_KEYWORD_PLACEHOLDER,
  builtinSearchEngineIds,
  createSearchEngineId,
  getDefaultSearchEngine,
  getSearchEngines,
  isValidSearchEngineTemplate,
} from '@/config/searchEngines'
import type { OpenTarget, SystemConfig, WebdavBackupConfig } from '@/config/schema'
import { useRestoreWebdavBackup } from '@/features/backup/useRestoreWebdavBackup'
import { useRunWebdavBackup } from '@/features/backup/useRunWebdavBackup'
import { useWebdavBackupVersions } from '@/features/backup/useWebdavBackupVersions'
import { getLocalizedSearchEngineName, getMessages, type Language } from '@/i18n/messages'
import { useI18n } from '@/i18n/runtime'
import { defaultSystemConfig } from '@/features/config/api'
import { defaultNavigationConfig } from '@/config/defaultConfig'
import {
  buildAppConfig,
  defaultAppConfig,
  formatAppConfig,
  parseAppConfigText,
} from '@/features/config/appConfig'
import { useSaveAppConfig } from '@/features/config/useSaveAppConfig'
import { getFeedbackNoticeClass } from '@/features/feedback/feedbackStyles'
import { useSaveSystemConfig } from '@/features/config/useSaveSystemConfig'
import { useSystemConfig } from '@/features/config/useSystemConfig'
import { useFeedback } from '@/features/feedback/useFeedback'
import { useAuthStatus, useLogout, useUpdateCredentials } from '@/features/auth/useAuth'
import { cloneNavigationConfig } from '@/features/navigation/navigationConfig'
import { useNavigationConfig } from '@/features/navigation/useNavigation'
import { useAppStore } from '@/store/appStore'

interface FeedbackState {
  type: 'success' | 'error'
  message: string
}

interface ServiceSettingsButtonProps {
  initialOpen?: boolean
}

function cloneWebdavBackupConfig(config: WebdavBackupConfig): WebdavBackupConfig {
  return {
    ...config,
  }
}

function isWebdavBackupConfigured(config: WebdavBackupConfig) {
  return Boolean(config.url.trim() && config.username.trim() && config.password)
}

function isWebdavBackupConfigEqual(left: WebdavBackupConfig, right: WebdavBackupConfig) {
  return (
    left.url === right.url &&
    left.username === right.username &&
    left.password === right.password &&
    left.remotePath === right.remotePath &&
    left.autoBackup === right.autoBackup &&
    left.intervalDays === right.intervalDays &&
    left.maxVersions === right.maxVersions
  )
}

function formatBackupVersionTime(language: Language, value: string) {
  const formatter = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return formatter.format(new Date(value))
}

function formatBackupVersionSize(size: number | null) {
  if (size === null || size < 0) {
    return '--'
  }

  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const sectionCardClass = 'config-panel-card p-4'
const compactSectionCardClass = 'config-panel-card p-3.5'
const toggleCardClass =
  'config-panel-card-muted flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between'
const accountSettingsFormId = 'account-settings-form'
const networkProbeSettingsFormId = 'network-probe-settings-form'
const webdavSettingsFormId = 'webdav-settings-form'

export function ServiceSettingsButton({ initialOpen = false }: ServiceSettingsButtonProps) {
  const { data: navigationConfig, refetch } = useNavigationConfig()
  const { data: systemConfig, refetch: refetchSystemConfig } = useSystemConfig()
  const activeSystemConfig = systemConfig ?? defaultSystemConfig
  const savedWebdavBackupConfig = activeSystemConfig.webdavBackup
  const webdavVersionsEnabled = isWebdavBackupConfigured(savedWebdavBackupConfig)
  const saveAppMutation = useSaveAppConfig()
  const saveSystemMutation = useSaveSystemConfig()
  const runWebdavBackupMutation = useRunWebdavBackup()
  const restoreWebdavBackupMutation = useRestoreWebdavBackup()
  const updateCredentialsMutation = useUpdateCredentials()
  const logoutMutation = useLogout()
  const setTheme = useAppStore((state) => state.setTheme)
  const setLanguage = useAppStore((state) => state.setLanguage)
  const authStatusQuery = useAuthStatus()
  const { showToast } = useFeedback()
  const { language, messages } = useI18n()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [activeSection, setActiveSection] = useState<
    'system' | 'network-probe' | 'account' | 'search-engines' | 'webdav-backup' | 'config-json'
  >('system')
  const [jsonDraft, setJsonDraft] = useState(formatAppConfig(defaultAppConfig))
  const [systemDraft, setSystemDraft] = useState(defaultSystemConfig)
  const [backupDraft, setBackupDraft] = useState(
    cloneWebdavBackupConfig(defaultSystemConfig.webdavBackup)
  )
  const [customEngineName, setCustomEngineName] = useState('')
  const [customEngineUrl, setCustomEngineUrl] = useState('')
  const [jsonFeedback, setJsonFeedback] = useState<FeedbackState | null>(null)
  const [systemFeedback, setSystemFeedback] = useState<FeedbackState | null>(null)
  const [networkFeedback, setNetworkFeedback] = useState<FeedbackState | null>(null)
  const [accountFeedback, setAccountFeedback] = useState<FeedbackState | null>(null)
  const [searchFeedback, setSearchFeedback] = useState<FeedbackState | null>(null)
  const [backupFeedback, setBackupFeedback] = useState<FeedbackState | null>(null)
  const [credentialsDraft, setCredentialsDraft] = useState({
    nextUsername: '',
    currentPassword: '',
    nextPassword: '',
    confirmPassword: '',
  })
  const webdavBackupVersionsQuery = useWebdavBackupVersions(
    isOpen && activeSection === 'webdav-backup' && webdavVersionsEnabled
  )

  const activeNavigation = useMemo(
    () => cloneNavigationConfig(navigationConfig ?? defaultNavigationConfig),
    [navigationConfig]
  )
  const activeAppConfig = useMemo(
    () => buildAppConfig(activeSystemConfig, activeNavigation),
    [activeNavigation, activeSystemConfig]
  )
  const availableSearchEngines = useMemo(
    () => getSearchEngines(systemDraft.customSearchEngines),
    [systemDraft.customSearchEngines]
  )
  const selectedSearchEngine = useMemo(
    () => getDefaultSearchEngine(systemDraft.defaultSearchEngine, systemDraft.customSearchEngines),
    [systemDraft.customSearchEngines, systemDraft.defaultSearchEngine]
  )
  const selectedSearchEngineName = getLocalizedSearchEngineName(language, selectedSearchEngine)
  const isWebdavBackupDirty = !isWebdavBackupConfigEqual(backupDraft, savedWebdavBackupConfig)
  const hasConfiguredNetworkProbe = hasCompleteNetworkProbeConfig(systemDraft.networkProbe)
  const lanProbePreview = systemDraft.networkProbe.lanHost.trim()
    ? buildNetworkProbeUrl(systemDraft.networkProbe.lanProtocol, systemDraft.networkProbe.lanHost)
    : `${systemDraft.networkProbe.lanProtocol}://<host>${NETWORK_PROBE_PATH}`
  const wanProbePreview = systemDraft.networkProbe.wanHost.trim()
    ? buildNetworkProbeUrl(systemDraft.networkProbe.wanProtocol, systemDraft.networkProbe.wanHost)
    : `${systemDraft.networkProbe.wanProtocol}://<host>${NETWORK_PROBE_PATH}`
  const canRunWebdavBackup =
    webdavVersionsEnabled &&
    !isWebdavBackupDirty &&
    !saveSystemMutation.isPending &&
    !runWebdavBackupMutation.isPending &&
    !restoreWebdavBackupMutation.isPending

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setJsonDraft(formatAppConfig(activeAppConfig))
    setSystemDraft(activeSystemConfig)
    setBackupDraft(cloneWebdavBackupConfig(activeSystemConfig.webdavBackup))
    setCredentialsDraft({
      nextUsername: authStatusQuery.data?.username ?? '',
      currentPassword: '',
      nextPassword: '',
      confirmPassword: '',
    })
  }, [activeAppConfig, activeSystemConfig, authStatusQuery.data?.username, isOpen])

  function openSettings() {
    setActiveSection('system')
    setJsonDraft(formatAppConfig(activeAppConfig))
    setSystemDraft(activeSystemConfig)
    setBackupDraft(cloneWebdavBackupConfig(activeSystemConfig.webdavBackup))
    setCustomEngineName('')
    setCustomEngineUrl('')
    setJsonFeedback(null)
    setSystemFeedback(null)
    setNetworkFeedback(null)
    setAccountFeedback(null)
    setSearchFeedback(null)
    setBackupFeedback(null)
    setCredentialsDraft({
      nextUsername: authStatusQuery.data?.username ?? '',
      currentPassword: '',
      nextPassword: '',
      confirmPassword: '',
    })
    setIsOpen(true)
  }

  async function handleReload() {
    const [{ data: nextNavigationConfig }, { data: nextSystemConfig }] = await Promise.all([
      refetch(),
      refetchSystemConfig(),
    ])
    const nextAppConfig = buildAppConfig(
      nextSystemConfig ?? defaultSystemConfig,
      nextNavigationConfig ?? defaultNavigationConfig
    )

    setJsonDraft(formatAppConfig(nextAppConfig))
    setSystemDraft(nextAppConfig.system)
    setBackupDraft(cloneWebdavBackupConfig(nextAppConfig.system.webdavBackup))
    setJsonFeedback({ type: 'success', message: messages.settings.jsonSection.reloaded })
    showToast({ type: 'warning', message: messages.settings.jsonSection.reloaded })
  }

  function handleFormat() {
    try {
      const parsed = parseAppConfigText(jsonDraft)
      setJsonDraft(formatAppConfig(parsed))
      setJsonFeedback({ type: 'success', message: messages.settings.jsonSection.formatted })
      showToast({ type: 'warning', message: messages.settings.jsonSection.formatted })
    } catch (error) {
      const message = error instanceof Error ? error.message : messages.common.invalidContentRetry
      setJsonFeedback({
        type: 'error',
        message,
      })
      showToast({ type: 'error', message })
    }
  }

  function handleSaveJson() {
    try {
      const parsed = parseAppConfigText(jsonDraft)

      saveAppMutation.mutate(parsed, {
        onSuccess: (savedConfig) => {
          setTheme(savedConfig.system.darkMode ? 'dark' : 'light')
          setSystemDraft(savedConfig.system)
          setBackupDraft(cloneWebdavBackupConfig(savedConfig.system.webdavBackup))
          setJsonDraft(formatAppConfig(savedConfig))
          setJsonFeedback({ type: 'success', message: messages.settings.jsonSection.saved })
          showToast({ type: 'success', message: messages.settings.jsonSection.saved })
          setIsOpen(false)
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : messages.common.saveFailedRetry
          setJsonFeedback({
            type: 'error',
            message,
          })
          showToast({ type: 'error', message })
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : messages.common.invalidContentRetry
      setJsonFeedback({
        type: 'error',
        message,
      })
      showToast({ type: 'error', message })
    }
  }

  function handleExportJson() {
    let exportConfig = activeAppConfig

    try {
      exportConfig = parseAppConfigText(jsonDraft)
    } catch {
      exportConfig = activeAppConfig
    }

    const blob = new Blob([`${formatAppConfig(exportConfig)}\n`], {
      type: 'application/json;charset=utf-8',
    })
    const downloadUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = downloadUrl
    anchor.download = `smart-harbor-config-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(downloadUrl)

    setJsonFeedback({ type: 'success', message: messages.settings.jsonSection.exported })
    showToast({ type: 'success', message: messages.settings.jsonSection.exported })
  }

  function handleOpenImportPicker() {
    fileInputRef.current?.click()
  }

  async function handleImportJsonFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const parsed = parseAppConfigText(text)

      setJsonDraft(formatAppConfig(parsed))
      setJsonFeedback({
        type: 'success',
        message: messages.settings.jsonSection.imported(file.name),
      })
      showToast({ type: 'success', message: messages.settings.jsonSection.imported(file.name) })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : messages.settings.jsonSection.importFailed
      setJsonFeedback({
        type: 'error',
        message,
      })
      showToast({ type: 'error', message })
    }
  }

  function saveSystemDraft(nextConfig: SystemConfig, successMessage: string) {
    setSystemDraft(nextConfig)
    setTheme(nextConfig.darkMode ? 'dark' : 'light')
    setSystemFeedback(null)

    saveSystemMutation.mutate(nextConfig, {
      onSuccess: (savedConfig) => {
        setSystemDraft(savedConfig)
        setBackupDraft(cloneWebdavBackupConfig(savedConfig.webdavBackup))
        setTheme(savedConfig.darkMode ? 'dark' : 'light')
        setSystemFeedback({
          type: 'success',
          message: successMessage,
        })
        showToast({ type: 'success', message: successMessage })
      },
      onError: (error) => {
        setSystemDraft(activeSystemConfig)
        setBackupDraft(cloneWebdavBackupConfig(activeSystemConfig.webdavBackup))
        setTheme(activeSystemConfig.darkMode ? 'dark' : 'light')
        const message =
          error instanceof Error ? error.message : messages.settings.systemSection.saveFailed
        setSystemFeedback({
          type: 'error',
          message,
        })
        showToast({ type: 'error', message })
      },
    })
  }

  function handleToggleDarkMode() {
    const nextDarkMode = !systemDraft.darkMode
    const nextConfig: SystemConfig = {
      ...systemDraft,
      darkMode: nextDarkMode,
    }

    const message = nextDarkMode
      ? messages.settings.systemSection.turnedOn
      : messages.settings.systemSection.turnedOff

    saveSystemDraft(nextConfig, message)
  }

  function handleOpenTargetChange(
    field: 'clickOpenTarget' | 'middleClickOpenTarget',
    target: OpenTarget
  ) {
    if (systemDraft[field] === target) {
      return
    }

    const nextConfig: SystemConfig = {
      ...systemDraft,
      [field]: target,
    }

    saveSystemDraft(nextConfig, messages.settings.systemSection.openBehaviorUpdated)
  }

  function handleCredentialsFieldChange(
    field: 'nextUsername' | 'currentPassword' | 'nextPassword' | 'confirmPassword',
    value: string
  ) {
    setCredentialsDraft((current) => ({
      ...current,
      [field]: value,
    }))
    setAccountFeedback(null)
  }

  function handleUpdateCredentials() {
    if (credentialsDraft.nextPassword !== credentialsDraft.confirmPassword) {
      setAccountFeedback({ type: 'error', message: messages.authPage.confirmPasswordMismatch })
      return
    }

    updateCredentialsMutation.mutate(
      {
        currentPassword: credentialsDraft.currentPassword,
        nextUsername: credentialsDraft.nextUsername,
        nextPassword: credentialsDraft.nextPassword,
      },
      {
        onSuccess: (status) => {
          setCredentialsDraft({
            nextUsername: status.username ?? credentialsDraft.nextUsername,
            currentPassword: '',
            nextPassword: '',
            confirmPassword: '',
          })
          setAccountFeedback({
            type: 'success',
            message: messages.settings.accountSection.credentialsUpdated,
          })
          showToast({
            type: 'success',
            message: messages.settings.accountSection.credentialsUpdated,
          })
        },
        onError: (error) => {
          const rawMessage = error instanceof Error ? error.message : messages.authPage.unknownError
          const message =
            rawMessage.includes('当前密码不正确') || rawMessage.includes('current password')
              ? messages.authPage.currentPasswordInvalid
              : rawMessage.includes('请先登录') || rawMessage.includes('session')
                ? messages.authPage.authRequired
                : rawMessage.includes('请先创建管理员账号')
                  ? messages.authPage.setupRequired
                  : rawMessage
          setAccountFeedback({ type: 'error', message })
          showToast({ type: 'error', message })
        },
      }
    )
  }

  function handleLogout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        setIsOpen(false)
        setAccountFeedback({
          type: 'success',
          message: messages.settings.accountSection.logoutSuccess,
        })
        showToast({ type: 'success', message: messages.settings.accountSection.logoutSuccess })
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : messages.authPage.unknownError
        setAccountFeedback({ type: 'error', message })
        showToast({ type: 'error', message })
      },
    })
  }

  function handleAccountSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    handleUpdateCredentials()
  }

  function handleLanguageChange(nextLanguage: Language) {
    if (language === nextLanguage) {
      return
    }

    setLanguage(nextLanguage)
    const nextMessages = getMessages(nextLanguage)
    const languageName =
      nextLanguage === 'en'
        ? nextMessages.settings.systemSection.languageEnglish
        : nextMessages.settings.systemSection.languageChinese
    const message = nextMessages.settings.systemSection.languageUpdated(languageName)

    setSystemFeedback({
      type: 'success',
      message,
    })
    showToast({ type: 'success', message })
  }

  function handleNetworkProbeFieldChange<K extends keyof SystemConfig['networkProbe']>(
    field: K,
    value: SystemConfig['networkProbe'][K]
  ) {
    setSystemDraft((current) => ({
      ...current,
      networkProbe: {
        ...current.networkProbe,
        [field]: value,
      },
    }))
    setNetworkFeedback(null)
  }

  function handleSaveNetworkProbeConfig() {
    const previousConfig = activeSystemConfig
    const nextConfig: SystemConfig = {
      ...systemDraft,
      networkProbe: {
        ...systemDraft.networkProbe,
        lanHost: systemDraft.networkProbe.lanHost.trim(),
        wanHost: systemDraft.networkProbe.wanHost.trim(),
      },
    }

    setSystemDraft(nextConfig)
    setNetworkFeedback(null)

    saveSystemMutation.mutate(nextConfig, {
      onSuccess: (savedConfig) => {
        setSystemDraft(savedConfig)
        setBackupDraft(cloneWebdavBackupConfig(savedConfig.webdavBackup))
        setNetworkFeedback({
          type: 'success',
          message: messages.settings.networkSection.saved,
        })
        showToast({ type: 'success', message: messages.settings.networkSection.saved })
      },
      onError: (error) => {
        setSystemDraft(previousConfig)
        setBackupDraft(cloneWebdavBackupConfig(previousConfig.webdavBackup))
        const message =
          error instanceof Error ? error.message : messages.settings.networkSection.saveFailed
        setNetworkFeedback({
          type: 'error',
          message,
        })
        showToast({ type: 'error', message })
      },
    })
  }

  function handleNetworkProbeSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    handleSaveNetworkProbeConfig()
  }

  function saveSearchDraft(
    nextConfig: SystemConfig,
    successMessage: string,
    options?: {
      onSuccess?: () => void
    }
  ) {
    const previousConfig = systemDraft

    setSystemDraft(nextConfig)
    setSearchFeedback(null)

    saveSystemMutation.mutate(nextConfig, {
      onSuccess: (savedConfig) => {
        setSystemDraft(savedConfig)
        setBackupDraft(cloneWebdavBackupConfig(savedConfig.webdavBackup))
        setSearchFeedback({
          type: 'success',
          message: successMessage,
        })
        showToast({ type: 'success', message: successMessage })
        options?.onSuccess?.()
      },
      onError: (error) => {
        setSystemDraft(previousConfig)
        setBackupDraft(cloneWebdavBackupConfig(activeSystemConfig.webdavBackup))
        const message =
          error instanceof Error ? error.message : messages.settings.searchSection.saveFailed
        setSearchFeedback({
          type: 'error',
          message,
        })
        showToast({ type: 'error', message })
      },
    })
  }

  function handleSelectSearchEngine(engineId: string) {
    if (systemDraft.defaultSearchEngine === engineId) {
      return
    }

    const nextConfig: SystemConfig = {
      ...systemDraft,
      defaultSearchEngine: engineId,
    }
    const engine = getDefaultSearchEngine(engineId, systemDraft.customSearchEngines)
    const message = messages.settings.searchSection.defaultSaved(
      getLocalizedSearchEngineName(language, engine)
    )

    saveSearchDraft(nextConfig, message)
  }

  function handleAddCustomSearchEngine() {
    const name = customEngineName.trim()
    const urlTemplate = customEngineUrl.trim()

    if (!name) {
      const message = messages.settings.searchSection.customNameRequired
      setSearchFeedback({ type: 'error', message })
      showToast({ type: 'error', message })
      return
    }

    if (!isValidSearchEngineTemplate(urlTemplate)) {
      const message = messages.settings.searchSection.validUrlRequired(SEARCH_KEYWORD_PLACEHOLDER)
      setSearchFeedback({ type: 'error', message })
      showToast({ type: 'error', message })
      return
    }

    const engineId = createSearchEngineId(name, [
      ...builtinSearchEngineIds,
      ...systemDraft.customSearchEngines.map((engine) => engine.id),
    ])
    const nextConfig: SystemConfig = {
      ...systemDraft,
      customSearchEngines: [
        ...systemDraft.customSearchEngines,
        { id: engineId, name, urlTemplate },
      ],
    }

    saveSearchDraft(nextConfig, messages.settings.searchSection.added(name), {
      onSuccess: () => {
        setCustomEngineName('')
        setCustomEngineUrl('')
      },
    })
  }

  function handleRemoveCustomSearchEngine(engineId: string) {
    const removedEngine = systemDraft.customSearchEngines.find((engine) => engine.id === engineId)
    if (!removedEngine) {
      return
    }

    const nextDefaultSearchEngine =
      systemDraft.defaultSearchEngine === engineId ? 'google' : systemDraft.defaultSearchEngine
    const nextConfig: SystemConfig = {
      ...systemDraft,
      defaultSearchEngine: nextDefaultSearchEngine,
      customSearchEngines: systemDraft.customSearchEngines.filter(
        (engine) => engine.id !== engineId
      ),
    }
    const message =
      nextDefaultSearchEngine === 'google' && systemDraft.defaultSearchEngine === engineId
        ? messages.settings.searchSection.removedResetDefault(
            removedEngine.name,
            getLocalizedSearchEngineName(language, { id: 'google', name: 'Google' })
          )
        : messages.settings.searchSection.removed(removedEngine.name)

    saveSearchDraft(nextConfig, message)
  }

  function handleBackupFieldChange(
    field: 'url' | 'username' | 'password' | 'remotePath',
    value: string
  ) {
    setBackupDraft((current) => ({
      ...current,
      [field]: value,
    }))
    setBackupFeedback(null)
  }

  function handleBackupNumberFieldChange(field: 'intervalDays' | 'maxVersions', value: string) {
    const parsedValue = Number.parseInt(value, 10)
    setBackupDraft((current) => ({
      ...current,
      [field]: Number.isNaN(parsedValue) ? current[field] : Math.max(1, parsedValue),
    }))
    setBackupFeedback(null)
  }

  function handleToggleAutoBackup() {
    setBackupDraft((current) => ({
      ...current,
      autoBackup: !current.autoBackup,
    }))
    setBackupFeedback(null)
  }

  function handleSaveWebdavBackupConfig() {
    const nextConfig: SystemConfig = {
      ...systemDraft,
      webdavBackup: cloneWebdavBackupConfig(backupDraft),
    }

    setBackupFeedback(null)

    saveSystemMutation.mutate(nextConfig, {
      onSuccess: (savedConfig) => {
        setSystemDraft(savedConfig)
        setBackupDraft(cloneWebdavBackupConfig(savedConfig.webdavBackup))
        setBackupFeedback({
          type: 'success',
          message: messages.settings.webdavSection.saved,
        })
        showToast({ type: 'success', message: messages.settings.webdavSection.saved })

        if (isWebdavBackupConfigured(savedConfig.webdavBackup)) {
          void webdavBackupVersionsQuery.refetch()
        }
      },
      onError: (error) => {
        const message =
          error instanceof Error ? error.message : messages.settings.webdavSection.saveFailed
        setBackupFeedback({
          type: 'error',
          message,
        })
        showToast({ type: 'error', message })
      },
    })
  }

  function handleWebdavSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    handleSaveWebdavBackupConfig()
  }

  async function handleRefreshWebdavVersions() {
    try {
      const result = await webdavBackupVersionsQuery.refetch()
      if (result.error) {
        throw result.error
      }

      setBackupFeedback({
        type: 'success',
        message: messages.settings.webdavSection.versionsRefreshed,
      })
      showToast({ type: 'success', message: messages.settings.webdavSection.versionsRefreshed })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : messages.errors.loadWebdavBackupVersionsFailed
      setBackupFeedback({
        type: 'error',
        message,
      })
      showToast({ type: 'error', message })
    }
  }

  function handleRunWebdavBackup() {
    if (!webdavVersionsEnabled) {
      setBackupFeedback({
        type: 'error',
        message: messages.settings.webdavSection.savedConfigMissing,
      })
      showToast({ type: 'error', message: messages.settings.webdavSection.savedConfigMissing })
      return
    }

    if (isWebdavBackupDirty) {
      setBackupFeedback({
        type: 'error',
        message: messages.settings.webdavSection.unsavedHint,
      })
      showToast({ type: 'error', message: messages.settings.webdavSection.unsavedHint })
      return
    }

    runWebdavBackupMutation.mutate(undefined, {
      onSuccess: (result) => {
        const message =
          result.removedVersionIds.length > 0
            ? messages.settings.webdavSection.manualBackupTrimmed(
                result.version.filename,
                result.removedVersionIds.length
              )
            : messages.settings.webdavSection.manualBackupSuccess(result.version.filename)

        setBackupFeedback({
          type: 'success',
          message,
        })
        showToast({ type: 'success', message })
      },
      onError: (error) => {
        const message =
          error instanceof Error ? error.message : messages.errors.runWebdavBackupFailed
        setBackupFeedback({
          type: 'error',
          message,
        })
        showToast({ type: 'error', message })
      },
    })
  }

  function handleRestoreWebdavBackup(versionId: string, filename: string) {
    if (!window.confirm(messages.settings.webdavSection.restoreConfirm(filename))) {
      return
    }

    restoreWebdavBackupMutation.mutate(versionId, {
      onSuccess: (result) => {
        setTheme(result.restoredConfig.system.darkMode ? 'dark' : 'light')
        setSystemDraft(result.restoredConfig.system)
        setBackupDraft(cloneWebdavBackupConfig(result.restoredConfig.system.webdavBackup))
        setJsonDraft(formatAppConfig(result.restoredConfig))

        const message = result.requiresReauth
          ? messages.settings.webdavSection.restoreSuccessReauth(filename)
          : messages.settings.webdavSection.restoreSuccess(filename)

        setBackupFeedback({
          type: 'success',
          message,
        })
        showToast({ type: 'success', message })

        if (result.requiresReauth) {
          setIsOpen(false)
          window.setTimeout(() => {
            window.location.reload()
          }, 300)
        }
      },
      onError: (error) => {
        const message =
          error instanceof Error ? error.message : messages.errors.restoreWebdavBackupFailed
        setBackupFeedback({
          type: 'error',
          message,
        })
        showToast({ type: 'error', message })
      },
    })
  }

  const panelTabs = [
    {
      key: 'system' as const,
      label: messages.settings.systemSection.label,
      description: messages.settings.systemSection.description,
      icon: systemDraft.darkMode ? MoonStar : Sun,
    },
    {
      key: 'network-probe' as const,
      label: messages.settings.networkSection.label,
      description: messages.settings.networkSection.description,
      icon: Wifi,
    },
    {
      key: 'account' as const,
      label: messages.settings.accountSection.label,
      description: messages.settings.accountSection.description,
      icon: KeyRound,
    },
    {
      key: 'search-engines' as const,
      label: messages.settings.searchSection.label,
      description: messages.settings.searchSection.description,
      icon: Globe,
    },
    {
      key: 'webdav-backup' as const,
      label: messages.settings.webdavSection.label,
      description: messages.settings.webdavSection.description,
      icon: RefreshCcw,
    },
    {
      key: 'config-json' as const,
      label: messages.settings.jsonSection.label,
      description: messages.settings.jsonSection.description,
      icon: FileJson,
    },
  ]

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={messages.settings.buttonAria}
        onClick={openSettings}
        className="h-10 w-10 rounded-full"
      >
        <Settings2 className="h-4.5 w-4.5" />
      </Button>

      <ModalShell
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={messages.settings.title}
        description={messages.settings.description}
        icon={Settings2}
        widthClassName="max-w-6xl"
      >
        <ConfigPanelLayout
          panelTitle={messages.settings.panelTitle}
          tabs={panelTabs}
          activeTab={activeSection}
          onTabChange={setActiveSection}
        >
          {activeSection === 'system' ? (
            <ConfigPanelSection
              title={messages.settings.systemSection.title}
              summary={messages.settings.systemSection.summary}
              footer={
                <>
                  <div className={getFeedbackNoticeClass(systemFeedback?.type)}>
                    {systemFeedback?.message ?? messages.settings.systemSection.footerHint}
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsOpen(false)}
                      className="w-full sm:w-auto"
                    >
                      {messages.common.close}
                    </Button>
                  </div>
                </>
              }
            >
              <div className="grid gap-3">
                <div className={sectionCardClass}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        {systemDraft.darkMode ? (
                          <MoonStar className="h-4.5 w-4.5 text-primary" />
                        ) : (
                          <Sun className="h-4.5 w-4.5 text-primary" />
                        )}
                        {messages.settings.systemSection.darkMode}
                      </div>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {messages.settings.systemSection.darkModeHint}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={systemDraft.darkMode}
                      onClick={handleToggleDarkMode}
                      disabled={saveSystemMutation.isPending}
                      data-checked={systemDraft.darkMode}
                      className="config-switch"
                    >
                      <span className="config-switch-thumb" />
                    </button>
                  </div>
                </div>

                <div className={sectionCardClass}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Languages className="h-4.5 w-4.5 text-primary" />
                    {messages.settings.systemSection.languageTitle}
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {messages.settings.systemSection.languageHint}
                  </p>
                  <div className="mt-3 max-w-xs space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {messages.settings.systemSection.languageLabel}
                    </label>
                    <select
                      value={language}
                      onChange={(event) => handleLanguageChange(event.target.value as Language)}
                      className="config-panel-select"
                    >
                      <option value="zh-CN">
                        {messages.settings.systemSection.languageChinese}
                      </option>
                      <option value="en">{messages.settings.systemSection.languageEnglish}</option>
                    </select>
                  </div>
                </div>
                <div className={sectionCardClass}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Settings2 className="h-4.5 w-4.5 text-primary" />
                    {messages.settings.systemSection.openBehaviorTitle}
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {messages.settings.systemSection.openBehaviorHint}
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {messages.settings.systemSection.clickOpenTarget}
                      </span>
                      <select
                        value={systemDraft.clickOpenTarget}
                        onChange={(event) =>
                          handleOpenTargetChange(
                            'clickOpenTarget',
                            event.target.value as OpenTarget
                          )
                        }
                        disabled={saveSystemMutation.isPending}
                        className="config-panel-select"
                      >
                        <option value="self">{messages.settings.systemSection.currentTab}</option>
                        <option value="blank">{messages.settings.systemSection.newTab}</option>
                      </select>
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {messages.settings.systemSection.middleClickOpenTarget}
                      </span>
                      <select
                        value={systemDraft.middleClickOpenTarget}
                        onChange={(event) =>
                          handleOpenTargetChange(
                            'middleClickOpenTarget',
                            event.target.value as OpenTarget
                          )
                        }
                        disabled={saveSystemMutation.isPending}
                        className="config-panel-select"
                      >
                        <option value="self">{messages.settings.systemSection.currentTab}</option>
                        <option value="blank">{messages.settings.systemSection.newTab}</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            </ConfigPanelSection>
          ) : activeSection === 'network-probe' ? (
            <ConfigPanelSection
              title={messages.settings.networkSection.title}
              summary={messages.settings.networkSection.summary}
              footer={
                <>
                  <div className={getFeedbackNoticeClass(networkFeedback?.type)}>
                    {networkFeedback?.message ?? messages.settings.networkSection.footerHint}
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsOpen(false)}
                      className="w-full sm:w-auto"
                    >
                      {messages.common.close}
                    </Button>
                    <Button
                      type="submit"
                      form={networkProbeSettingsFormId}
                      size="sm"
                      disabled={saveSystemMutation.isPending}
                      className="w-full sm:w-auto"
                    >
                      {messages.common.save}
                    </Button>
                  </div>
                </>
              }
            >
              <form
                id={networkProbeSettingsFormId}
                className="grid gap-3"
                onSubmit={handleNetworkProbeSettingsSubmit}
              >
                <div className={sectionCardClass}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Wifi className="h-4.5 w-4.5 text-primary" />
                    {messages.settings.networkSection.connectionTitle}
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {messages.settings.networkSection.connectionHint}
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                      <div className="text-xs font-medium text-foreground">
                        {messages.settings.networkSection.lanTitle}
                      </div>
                      <div className="mt-3 grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                          <label className="space-y-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              {messages.settings.networkSection.protocolLabel}
                            </span>
                            <select
                              value={systemDraft.networkProbe.lanProtocol}
                              onChange={(event) =>
                                handleNetworkProbeFieldChange(
                                  'lanProtocol',
                                  event.target.value as SystemConfig['networkProbe']['lanProtocol']
                                )
                              }
                              className="config-panel-select"
                            >
                              <option value="http">http</option>
                              <option value="https">https</option>
                            </select>
                          </label>
                          <label className="space-y-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              {messages.settings.networkSection.hostLabel}
                            </span>
                            <Input
                              value={systemDraft.networkProbe.lanHost}
                              onChange={(event) =>
                                handleNetworkProbeFieldChange('lanHost', event.target.value)
                              }
                              placeholder={messages.settings.networkSection.lanPlaceholder}
                              className="h-10"
                            />
                          </label>
                        </div>
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-muted-foreground">
                            {messages.settings.networkSection.previewLabel}
                          </div>
                          <div className="rounded-lg border border-border/70 bg-muted/35 px-3 py-2 font-mono text-[11px] leading-5 text-foreground/80">
                            {lanProbePreview}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                      <div className="text-xs font-medium text-foreground">
                        {messages.settings.networkSection.wanTitle}
                      </div>
                      <div className="mt-3 grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                          <label className="space-y-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              {messages.settings.networkSection.protocolLabel}
                            </span>
                            <select
                              value={systemDraft.networkProbe.wanProtocol}
                              onChange={(event) =>
                                handleNetworkProbeFieldChange(
                                  'wanProtocol',
                                  event.target.value as SystemConfig['networkProbe']['wanProtocol']
                                )
                              }
                              className="config-panel-select"
                            >
                              <option value="http">http</option>
                              <option value="https">https</option>
                            </select>
                          </label>
                          <label className="space-y-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              {messages.settings.networkSection.hostLabel}
                            </span>
                            <Input
                              value={systemDraft.networkProbe.wanHost}
                              onChange={(event) =>
                                handleNetworkProbeFieldChange('wanHost', event.target.value)
                              }
                              placeholder={messages.settings.networkSection.wanPlaceholder}
                              className="h-10"
                            />
                          </label>
                        </div>
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-muted-foreground">
                            {messages.settings.networkSection.previewLabel}
                          </div>
                          <div className="rounded-lg border border-border/70 bg-muted/35 px-3 py-2 font-mono text-[11px] leading-5 text-foreground/80">
                            {wanProbePreview}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-border/70 bg-background/82 px-3 py-3 text-xs leading-5 text-muted-foreground dark:bg-stone-900/72">
                    <p>{messages.settings.networkSection.suffixHint(NETWORK_PROBE_PATH)}</p>
                    <p className="mt-1">{messages.settings.networkSection.fallbackHint}</p>
                    <p className="mt-1 font-medium text-foreground/85">
                      {hasConfiguredNetworkProbe
                        ? messages.settings.networkSection.priorityReady
                        : messages.settings.networkSection.priorityFallback}
                    </p>
                  </div>
                </div>
              </form>
            </ConfigPanelSection>
          ) : activeSection === 'account' ? (
            <ConfigPanelSection
              title={messages.settings.accountSection.title}
              summary={messages.settings.accountSection.summary}
              footer={
                <>
                  <div className={getFeedbackNoticeClass(accountFeedback?.type)}>
                    {accountFeedback?.message ?? messages.settings.accountSection.footerHint}
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsOpen(false)}
                      className="w-full sm:w-auto"
                    >
                      {messages.common.close}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleLogout}
                      disabled={logoutMutation.isPending}
                      className="w-full sm:w-auto"
                    >
                      {logoutMutation.isPending
                        ? messages.settings.accountSection.logoutPending
                        : messages.settings.accountSection.logoutButton}
                    </Button>
                    <Button
                      type="submit"
                      form={accountSettingsFormId}
                      size="sm"
                      disabled={updateCredentialsMutation.isPending}
                      className="w-full sm:w-auto"
                    >
                      {updateCredentialsMutation.isPending
                        ? messages.settings.accountSection.updateCredentialsPending
                        : messages.common.save}
                    </Button>
                  </div>
                </>
              }
            >
              <form
                id={accountSettingsFormId}
                className="grid gap-3"
                onSubmit={handleAccountSettingsSubmit}
              >
                <div className={sectionCardClass}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <KeyRound className="h-4.5 w-4.5 text-primary" />
                    {messages.settings.accountSection.authTitle}
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {messages.settings.accountSection.authHint}
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="space-y-1.5 md:col-span-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {messages.settings.accountSection.currentUsernameLabel}
                      </span>
                      <Input
                        value={authStatusQuery.data?.username ?? ''}
                        disabled
                        name="currentUsername"
                        className="h-10"
                      />
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {messages.settings.accountSection.nextUsernameLabel}
                      </span>
                      <Input
                        name="nextUsername"
                        value={credentialsDraft.nextUsername}
                        onChange={(event) =>
                          handleCredentialsFieldChange('nextUsername', event.target.value)
                        }
                        autoComplete="username"
                        className="h-10"
                      />
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {messages.settings.accountSection.currentPasswordLabel}
                      </span>
                      <Input
                        name="currentPassword"
                        type="password"
                        value={credentialsDraft.currentPassword}
                        onChange={(event) =>
                          handleCredentialsFieldChange('currentPassword', event.target.value)
                        }
                        autoComplete="current-password"
                        className="h-10"
                      />
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {messages.settings.accountSection.nextPasswordLabel}
                      </span>
                      <Input
                        name="nextPassword"
                        type="password"
                        value={credentialsDraft.nextPassword}
                        onChange={(event) =>
                          handleCredentialsFieldChange('nextPassword', event.target.value)
                        }
                        autoComplete="new-password"
                        className="h-10"
                      />
                      <p className="text-xs leading-5 text-muted-foreground">
                        {messages.settings.accountSection.passwordPolicyHint}
                      </p>
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {messages.settings.accountSection.confirmPasswordLabel}
                      </span>
                      <Input
                        name="confirmPassword"
                        type="password"
                        value={credentialsDraft.confirmPassword}
                        onChange={(event) =>
                          handleCredentialsFieldChange('confirmPassword', event.target.value)
                        }
                        autoComplete="new-password"
                        className="h-10"
                      />
                    </label>
                  </div>
                </div>
              </form>
            </ConfigPanelSection>
          ) : activeSection === 'search-engines' ? (
            <ConfigPanelSection
              title={messages.settings.searchSection.title}
              summary={messages.settings.searchSection.summary}
              footer={
                <>
                  <div className={getFeedbackNoticeClass(searchFeedback?.type)}>
                    {searchFeedback?.message ?? messages.settings.searchSection.footerHint}
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsOpen(false)}
                      className="w-full sm:w-auto"
                    >
                      {messages.common.close}
                    </Button>
                  </div>
                </>
              }
            >
              <div className="space-y-3">
                <div className={sectionCardClass}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Globe className="h-4.5 w-4.5 text-primary" />
                    {messages.settings.searchSection.defaultTitle}
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {messages.settings.searchSection.currentSelection(selectedSearchEngineName)}
                  </p>
                  <div className="mt-3 grid gap-2">
                    {availableSearchEngines.map((engine) => {
                      const isActive = systemDraft.defaultSearchEngine === engine.id

                      return (
                        <div
                          key={engine.id}
                          className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                            isActive
                              ? 'border-primary/40 bg-primary/10 shadow-[0_14px_28px_hsl(var(--primary)/0.08)]'
                              : 'border-border/70 bg-background/70 hover:border-primary/20 hover:bg-accent/40'
                          }`}
                        >
                          <label
                            htmlFor={`search-engine-${engine.id}`}
                            className="flex min-w-0 flex-1 cursor-pointer items-start gap-3"
                          >
                            <span
                              className={`mt-1 flex h-4 w-4 items-center justify-center rounded-full border transition ${
                                isActive
                                  ? 'border-primary bg-primary/10'
                                  : 'border-border/80 bg-background'
                              }`}
                            >
                              <input
                                id={`search-engine-${engine.id}`}
                                type="radio"
                                name="default-search-engine"
                                className="sr-only"
                                checked={isActive}
                                disabled={saveSystemMutation.isPending}
                                onChange={() => handleSelectSearchEngine(engine.id)}
                              />
                              <span
                                className={`h-2 w-2 rounded-full transition ${isActive ? 'bg-primary' : 'bg-transparent'}`}
                              />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-foreground">
                                  {getLocalizedSearchEngineName(language, engine)}
                                </span>
                                <span className="rounded-full border border-border/80 bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">
                                  {engine.builtIn
                                    ? messages.common.builtIn
                                    : messages.common.custom}
                                </span>
                              </span>
                              <span className="mt-1 block break-all font-mono text-[11px] leading-5 text-muted-foreground">
                                {engine.urlTemplate}
                              </span>
                            </span>
                          </label>
                          {!engine.builtIn ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-500"
                              onClick={() => handleRemoveCustomSearchEngine(engine.id)}
                              disabled={saveSystemMutation.isPending}
                              aria-label={messages.settings.searchSection.removeAria(
                                getLocalizedSearchEngineName(language, engine)
                              )}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className={sectionCardClass}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Plus className="h-4.5 w-4.5 text-primary" />
                    {messages.settings.searchSection.addCustomTitle}
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {messages.settings.searchSection.addCustomSummary(SEARCH_KEYWORD_PLACEHOLDER)}
                  </p>
                  <div className="mt-3 grid gap-3">
                    <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          {messages.settings.searchSection.nameLabel}
                        </label>
                        <Input
                          value={customEngineName}
                          onChange={(event) => {
                            setCustomEngineName(event.target.value)
                            setSearchFeedback(null)
                          }}
                          placeholder={messages.common.searchEngineNameExample}
                          disabled={saveSystemMutation.isPending}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          {messages.settings.searchSection.urlTemplateLabel}
                        </label>
                        <Input
                          value={customEngineUrl}
                          onChange={(event) => {
                            setCustomEngineUrl(event.target.value)
                            setSearchFeedback(null)
                          }}
                          placeholder={`https://example.com/search?q=${SEARCH_KEYWORD_PLACEHOLDER}`}
                          disabled={saveSystemMutation.isPending}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddCustomSearchEngine}
                        disabled={saveSystemMutation.isPending}
                      >
                        <Plus className="h-4 w-4" />
                        {messages.settings.searchSection.addButton}
                      </Button>
                      <span className="text-xs leading-5 text-muted-foreground">
                        {messages.settings.searchSection.presetHint}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </ConfigPanelSection>
          ) : activeSection === 'webdav-backup' ? (
            <ConfigPanelSection
              title={messages.settings.webdavSection.title}
              summary={messages.settings.webdavSection.summary}
              bodyClassName="px-3 py-3"
              headerActions={
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshWebdavVersions}
                    disabled={!webdavVersionsEnabled || webdavBackupVersionsQuery.isFetching}
                  >
                    <RefreshCcw className="h-4 w-4" />
                    {messages.settings.webdavSection.refreshVersions}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRunWebdavBackup}
                    disabled={!canRunWebdavBackup}
                  >
                    <Upload className="h-4 w-4" />
                    {runWebdavBackupMutation.isPending
                      ? messages.settings.webdavSection.manualBackupPending
                      : messages.settings.webdavSection.manualBackup}
                  </Button>
                </>
              }
              footer={
                <>
                  <div className={getFeedbackNoticeClass(backupFeedback?.type)}>
                    {backupFeedback?.message ??
                      (isWebdavBackupDirty
                        ? messages.settings.webdavSection.unsavedHint
                        : webdavVersionsEnabled
                          ? backupDraft.autoBackup
                            ? messages.settings.webdavSection.autoBackupOn
                            : messages.settings.webdavSection.autoBackupOff
                          : messages.settings.webdavSection.savedConfigMissing)}
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsOpen(false)}
                      className="w-full sm:w-auto"
                    >
                      {messages.common.close}
                    </Button>
                    <Button
                      type="submit"
                      form={webdavSettingsFormId}
                      size="sm"
                      disabled={
                        saveSystemMutation.isPending ||
                        runWebdavBackupMutation.isPending ||
                        restoreWebdavBackupMutation.isPending
                      }
                      className="w-full sm:w-auto"
                    >
                      <Save className="h-4 w-4" />
                      {messages.common.save}
                    </Button>
                  </div>
                </>
              }
            >
              <form
                id={webdavSettingsFormId}
                className="grid gap-2.5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
                onSubmit={handleWebdavSettingsSubmit}
              >
                <div className="space-y-2.5">
                  <div className={compactSectionCardClass}>
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Globe className="h-4.5 w-4.5 text-primary" />
                      {messages.settings.webdavSection.connectionTitle}
                    </div>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                      {messages.settings.webdavSection.connectionHint}
                    </p>
                    <div className="mt-3 grid gap-2.5">
                      <label className="space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          {messages.settings.webdavSection.urlLabel}
                        </span>
                        <Input
                          name="url"
                          value={backupDraft.url}
                          onChange={(event) => handleBackupFieldChange('url', event.target.value)}
                          placeholder="https://dav.example.com/remote.php/dav/files/admin"
                          disabled={saveSystemMutation.isPending}
                        />
                      </label>

                      <div className="grid gap-2.5 md:grid-cols-2">
                        <label className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">
                            {messages.settings.webdavSection.usernameLabel}
                          </span>
                          <Input
                            name="username"
                            value={backupDraft.username}
                            onChange={(event) =>
                              handleBackupFieldChange('username', event.target.value)
                            }
                            autoComplete="username"
                            disabled={saveSystemMutation.isPending}
                          />
                        </label>

                        <label className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">
                            {messages.settings.webdavSection.passwordLabel}
                          </span>
                          <Input
                            name="password"
                            type="password"
                            value={backupDraft.password}
                            onChange={(event) =>
                              handleBackupFieldChange('password', event.target.value)
                            }
                            autoComplete="current-password"
                            disabled={saveSystemMutation.isPending}
                          />
                        </label>
                      </div>

                      <label className="space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          {messages.settings.webdavSection.remotePathLabel}
                        </span>
                        <Input
                          name="remotePath"
                          value={backupDraft.remotePath}
                          onChange={(event) =>
                            handleBackupFieldChange('remotePath', event.target.value)
                          }
                          placeholder="/smart-harbor/backups/prod"
                          disabled={saveSystemMutation.isPending}
                        />
                        <p className="text-xs leading-5 text-muted-foreground">
                          {messages.settings.webdavSection.remotePathHint}
                        </p>
                      </label>
                    </div>
                  </div>

                  <div className={compactSectionCardClass}>
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Settings2 className="h-4.5 w-4.5 text-primary" />
                      {messages.settings.webdavSection.strategyTitle}
                    </div>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                      {messages.settings.webdavSection.strategyHint}
                    </p>
                    <div className="mt-3 grid gap-2.5">
                      <div className={toggleCardClass}>
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {messages.settings.webdavSection.autoBackupLabel}
                          </div>
                          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                            {messages.settings.webdavSection.autoBackupHint}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={backupDraft.autoBackup}
                          onClick={handleToggleAutoBackup}
                          disabled={saveSystemMutation.isPending}
                          data-checked={backupDraft.autoBackup}
                          className="config-switch"
                        >
                          <span className="config-switch-thumb" />
                        </button>
                      </div>

                      <div className="grid gap-2.5 md:grid-cols-2">
                        <label className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">
                            {messages.settings.webdavSection.intervalDaysLabel}
                          </span>
                          <Input
                            name="intervalDays"
                            type="number"
                            min={1}
                            max={365}
                            value={backupDraft.intervalDays}
                            onChange={(event) =>
                              handleBackupNumberFieldChange('intervalDays', event.target.value)
                            }
                            disabled={saveSystemMutation.isPending}
                          />
                        </label>

                        <label className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">
                            {messages.settings.webdavSection.maxVersionsLabel}
                          </span>
                          <Input
                            name="maxVersions"
                            type="number"
                            min={1}
                            max={365}
                            value={backupDraft.maxVersions}
                            onChange={(event) =>
                              handleBackupNumberFieldChange('maxVersions', event.target.value)
                            }
                            disabled={saveSystemMutation.isPending}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={compactSectionCardClass}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <FileJson className="h-4.5 w-4.5 text-primary" />
                    {messages.settings.webdavSection.versionsTitle}
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {messages.settings.webdavSection.versionsHint}
                  </p>

                  <div className="mt-3 space-y-1.5">
                    {!webdavVersionsEnabled ? (
                      <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-4 py-5 text-sm text-muted-foreground">
                        {messages.settings.webdavSection.savedConfigMissing}
                      </div>
                    ) : webdavBackupVersionsQuery.isLoading ? (
                      <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-4 py-5 text-sm text-muted-foreground">
                        {messages.common.loading}
                      </div>
                    ) : webdavBackupVersionsQuery.error instanceof Error ? (
                      <div className="rounded-xl border border-dashed border-red-500/30 bg-red-500/5 px-4 py-5 text-sm text-red-600 dark:text-red-300">
                        {webdavBackupVersionsQuery.error.message}
                      </div>
                    ) : webdavBackupVersionsQuery.data?.length ? (
                      webdavBackupVersionsQuery.data.map((version, index) => (
                        <div
                          key={version.id}
                          className="config-panel-card-muted p-2.5"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-medium text-foreground">
                                  {version.filename}
                                </span>
                                {index === 0 ? (
                                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                                    {messages.settings.webdavSection.latestTag}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {formatBackupVersionTime(language, version.createdAt)} ·{' '}
                                {formatBackupVersionSize(version.size)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleRestoreWebdavBackup(version.id, version.filename)
                              }
                              disabled={
                                restoreWebdavBackupMutation.isPending ||
                                runWebdavBackupMutation.isPending ||
                                saveSystemMutation.isPending
                              }
                            >
                              <RefreshCcw className="h-4 w-4" />
                              {restoreWebdavBackupMutation.isPending &&
                              restoreWebdavBackupMutation.variables === version.id
                                ? messages.settings.webdavSection.restorePending
                                : messages.settings.webdavSection.restoreAction}
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-4 py-5 text-sm text-muted-foreground">
                        {messages.settings.webdavSection.versionsEmpty}
                      </div>
                    )}
                  </div>
                </div>
              </form>
            </ConfigPanelSection>
          ) : (
            <ConfigPanelSection
              title={messages.settings.jsonSection.title}
              summary={messages.settings.jsonSection.summary}
              headerActions={
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={handleImportJsonFile}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleReload}>
                    <RefreshCcw className="h-4 w-4" />
                    {messages.common.refresh}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleOpenImportPicker}
                  >
                    <Upload className="h-4 w-4" />
                    {messages.common.import}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleExportJson}>
                    <Download className="h-4 w-4" />
                    {messages.common.export}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleFormat}>
                    <WandSparkles className="h-4 w-4" />
                    {messages.common.format}
                  </Button>
                </>
              }
              bodyClassName="overflow-visible px-5 py-4 md:overflow-hidden"
              footer={
                <>
                  <div className={getFeedbackNoticeClass(jsonFeedback?.type)}>
                    {jsonFeedback?.message ?? messages.settings.jsonSection.footerHint}
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsOpen(false)}
                      className="w-full sm:w-auto"
                    >
                      {messages.common.close}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveJson}
                      disabled={saveAppMutation.isPending}
                      className="w-full sm:w-auto"
                    >
                      <Save className="h-4 w-4" />
                      {messages.common.save}
                    </Button>
                  </div>
                </>
              }
            >
              <textarea
                value={jsonDraft}
                onChange={(event) => {
                  setJsonDraft(event.target.value)
                  setJsonFeedback(null)
                }}
                spellCheck={false}
                className="config-panel-textarea h-full min-h-[340px] resize-none font-mono text-[11px] leading-5"
              />
            </ConfigPanelSection>
          )}
        </ConfigPanelLayout>
      </ModalShell>
    </>
  )
}
