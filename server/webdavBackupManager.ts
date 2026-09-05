import type { AppConfig, AuthConfig, SystemConfig } from '../src/config/schema.js'
import {
  createWebdavBackup,
  isWebdavBackupConfigured,
  listWebdavBackupVersions,
  restoreWebdavBackup,
} from './webdavBackup.js'

const DAY_MS = 1000 * 60 * 60 * 24
const RETRY_DELAY_MS = 1000 * 60 * 60

interface LoggerLike {
  info: (message: unknown, ...args: unknown[]) => void
  warn: (message: unknown, ...args: unknown[]) => void
  error: (message: unknown, ...args: unknown[]) => void
}

interface CreateWebdavBackupManagerOptions {
  readAppConfig: () => Promise<AppConfig>
  readSystemConfig: () => Promise<SystemConfig>
  writeAppConfig: (value: unknown) => Promise<AppConfig>
  logger?: LoggerLike
  now?: () => Date
}

function areAuthConfigsEqual(left?: AuthConfig, right?: AuthConfig) {
  return left?.username === right?.username && left?.passwordHash === right?.passwordHash
}

function defaultLogger() {
  return console satisfies LoggerLike
}

export function createWebdavBackupManager(options: CreateWebdavBackupManagerOptions) {
  const logger = options.logger ?? defaultLogger()

  let disposed = false
  let queue: Promise<unknown> = Promise.resolve()
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (!timer) {
      return
    }

    clearTimeout(timer)
    timer = null
  }

  function scheduleTimer(delayMs: number) {
    if (disposed) {
      return
    }

    clearTimer()
    timer = setTimeout(
      () => {
        timer = null
        // Long waits are split; waking up is not permission to run a backup.
        if (delayMs > DAY_MS) void reloadSchedule()
        else void triggerScheduledBackup()
      },
      Math.min(DAY_MS, Math.max(0, delayMs))
    )
    timer.unref?.()
  }

  function enqueue<T>(operation: () => Promise<T>) {
    const nextOperation = queue.then(operation, operation)
    queue = nextOperation.then(
      () => undefined,
      () => undefined
    )
    return nextOperation
  }

  async function planNextRunUnsafe() {
    clearTimer()

    if (disposed) {
      return
    }

    const systemConfig = await options.readSystemConfig()
    const settings = systemConfig.webdavBackup

    if (!settings.autoBackup) {
      return
    }

    if (!isWebdavBackupConfigured(settings)) {
      logger.warn('WebDAV 自动备份已开启，但配置不完整，已跳过调度')
      return
    }

    try {
      const versions = await listWebdavBackupVersions(settings)
      const latestVersion = versions[0]
      const intervalMs = settings.intervalDays * DAY_MS
      const dueAt = latestVersion
        ? new Date(latestVersion.createdAt).getTime() + intervalMs
        : Date.now()
      const delayMs = Math.max(0, dueAt - Date.now())

      scheduleTimer(delayMs)
      logger.info(
        {
          delayMs,
          intervalDays: settings.intervalDays,
        },
        'WebDAV 自动备份已重新调度'
      )
    } catch (error) {
      logger.error(error, '刷新 WebDAV 自动备份调度失败，1 小时后重试')
      scheduleTimer(RETRY_DELAY_MS)
    }
  }

  async function triggerScheduledBackup() {
    try {
      await runBackup('auto')
    } catch (error) {
      logger.error(error, '执行 WebDAV 自动备份失败，1 小时后重试')
      scheduleTimer(RETRY_DELAY_MS)
    }
  }

  async function listVersions() {
    return enqueue(async () => {
      const systemConfig = await options.readSystemConfig()
      return listWebdavBackupVersions(systemConfig.webdavBackup)
    })
  }

  async function runBackup(trigger: 'manual' | 'auto') {
    return enqueue(async () => {
      const appConfig = await options.readAppConfig()
      const result = await createWebdavBackup(
        appConfig.system.webdavBackup,
        appConfig,
        options.now ? { now: options.now() } : undefined
      )

      await planNextRunUnsafe()
      logger.info({ trigger, versionId: result.version.id }, 'WebDAV 备份已完成')
      return result
    })
  }

  async function restoreVersion(versionId: string) {
    return enqueue(async () => {
      const currentConfig = await options.readAppConfig()
      const restoredConfig = await restoreWebdavBackup(currentConfig.system.webdavBackup, versionId)
      const savedConfig = await options.writeAppConfig(restoredConfig)
      const requiresReauth = !areAuthConfigsEqual(
        currentConfig.system.auth,
        savedConfig.system.auth
      )

      await planNextRunUnsafe()
      logger.info({ versionId, requiresReauth }, 'WebDAV 备份版本已恢复')

      return {
        restoredConfig: savedConfig,
        requiresReauth,
      }
    })
  }

  async function reloadSchedule() {
    return enqueue(async () => {
      await planNextRunUnsafe()
    })
  }

  function stop() {
    disposed = true
    clearTimer()
  }

  return {
    listVersions,
    runBackup,
    restoreVersion,
    reloadSchedule,
    stop,
  }
}
