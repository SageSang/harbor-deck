import type { AppConfig, SystemConfig } from '../src/config/schema.js'
import {
  createWebdavBackup,
  isWebdavBackupConfigured,
  listWebdavBackupVersions,
  restoreWebdavBackup,
  type WebdavBackupResult,
} from './webdavBackup.js'

const DAY_MS = 1000 * 60 * 60 * 24
const RETRY_DELAY_MS = 1000 * 60 * 60

interface LoggerLike {
  info: (message: unknown, ...args: unknown[]) => void
  warn: (message: unknown, ...args: unknown[]) => void
  error: (message: unknown, ...args: unknown[]) => void
}

export interface RestoredConfigResult {
  restoredConfig: AppConfig
  requiresReauth: boolean
}

interface CreateWebdavBackupManagerOptions {
  readAppConfig: () => Promise<AppConfig>
  readSystemConfig: () => Promise<SystemConfig>
  commitRestoredConfig: (value: unknown, canCommit: () => boolean) => Promise<RestoredConfigResult>
  logger?: LoggerLike
  now?: () => Date
}

export function createWebdavBackupManager(options: CreateWebdavBackupManagerOptions) {
  const logger = options.logger ?? console
  const lifetime = new AbortController()
  let disposed = false
  let queue: Promise<unknown> = Promise.resolve()
  let reloadVersion = 0
  let reloadPending: Promise<void> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function assertRunning() {
    if (disposed) throw new Error('WebDAV 备份服务已停止')
  }

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function scheduleTimer(delayMs: number, action: 'reload' | 'backup' = 'backup') {
    if (disposed) return
    clearTimer()
    timer = setTimeout(
      () => {
        timer = null
        if (delayMs > DAY_MS || action === 'reload') requestReload()
        else void triggerScheduledBackup()
      },
      Math.min(DAY_MS, Math.max(0, delayMs))
    )
    timer.unref?.()
  }

  function enqueue<T>(operation: () => Promise<T>) {
    const execute = async () => {
      assertRunning()
      return operation()
    }
    const nextOperation = queue.then(execute, execute)
    queue = nextOperation.then(
      () => undefined,
      () => undefined
    )
    return nextOperation
  }

  async function planNextRunUnsafe(version: number) {
    clearTimer()
    if (disposed) return
    try {
      const settings = (await options.readSystemConfig()).webdavBackup
      if (!settings.autoBackup || disposed) return
      if (!isWebdavBackupConfigured(settings)) {
        logger.warn('WebDAV 自动备份已开启，但配置不完整，已跳过调度')
        return
      }
      const versions = await listWebdavBackupVersions(settings, { signal: lifetime.signal })
      if (disposed || version !== reloadVersion) return
      const latest = versions[0]
      const dueAt = latest
        ? new Date(latest.createdAt).getTime() + settings.intervalDays * DAY_MS
        : Date.now()
      const delayMs = Math.max(0, dueAt - Date.now())
      scheduleTimer(delayMs)
      logger.info({ delayMs, intervalDays: settings.intervalDays }, 'WebDAV 自动备份已重新调度')
    } catch (error) {
      if (disposed || version !== reloadVersion) return
      logger.error(error, '刷新 WebDAV 自动备份调度失败，1 小时后重试')
      scheduleTimer(RETRY_DELAY_MS, 'reload')
    }
  }

  function reloadSchedule(): Promise<void> {
    if (disposed) return Promise.resolve()
    reloadVersion += 1
    if (reloadPending) return reloadPending
    const pending = enqueue(async () => {
      let version: number
      do {
        version = reloadVersion
        await planNextRunUnsafe(version)
      } while (!disposed && version !== reloadVersion)
    })
    reloadPending = pending.finally(() => {
      reloadPending = null
    })
    return reloadPending
  }

  function requestReload() {
    if (disposed) return
    void reloadSchedule().catch((error) => {
      if (!disposed) {
        logger.error(error, '刷新 WebDAV 调度失败')
        scheduleTimer(RETRY_DELAY_MS, 'reload')
      }
    })
  }

  async function triggerScheduledBackup() {
    try {
      await runBackup('auto')
    } catch (error) {
      if (!disposed) {
        logger.error(error, '执行 WebDAV 自动备份失败，1 小时后重试')
        scheduleTimer(RETRY_DELAY_MS)
      }
    }
  }

  function listVersions() {
    return enqueue(async () => {
      const config = await options.readSystemConfig()
      return listWebdavBackupVersions(config.webdavBackup, { signal: lifetime.signal })
    })
  }

  function runBackup(trigger: 'manual'): Promise<WebdavBackupResult>
  function runBackup(trigger: 'auto'): Promise<WebdavBackupResult | null>
  function runBackup(trigger: 'manual' | 'auto'): Promise<WebdavBackupResult | null> {
    return enqueue(async () => {
      const appConfig = await options.readAppConfig()
      if (trigger === 'auto' && !appConfig.system.webdavBackup.autoBackup) return null
      const result = await createWebdavBackup(appConfig.system.webdavBackup, appConfig, {
        signal: lifetime.signal,
        ...(options.now ? { now: options.now() } : {}),
      })
      // Replanning is queued separately: a confirmed upload stays successful.
      requestReload()
      logger.info(
        { trigger, versionId: result.version.id, warnings: result.warnings },
        'WebDAV 备份已完成'
      )
      return result
    })
  }

  function restoreVersion(versionId: string) {
    return enqueue(async () => {
      const current = await options.readAppConfig()
      const restored = await restoreWebdavBackup(current.system.webdavBackup, versionId, {
        signal: lifetime.signal,
      })
      assertRunning()
      // The app owns the atomic local commit and synchronous access invalidation.
      // It checks canCommit again immediately before rename. Once rename starts,
      // stop() waits for the commit and its invalidation to finish.
      const result = await options.commitRestoredConfig(restored, () => !disposed)
      requestReload()
      logger.info({ versionId, requiresReauth: result.requiresReauth }, 'WebDAV 备份版本已恢复')
      return result
    })
  }

  function stop() {
    disposed = true
    clearTimer()
    lifetime.abort(new Error('WebDAV 备份服务已停止'))
    return queue.then(() => undefined)
  }

  return { listVersions, runBackup, restoreVersion, reloadSchedule, start: requestReload, stop }
}
