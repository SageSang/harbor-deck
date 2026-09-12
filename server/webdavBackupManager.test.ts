// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appConfigSchema } from '../src/config/schema'
vi.mock('./webdavBackup', () => ({
  isWebdavBackupConfigured: () => true,
  listWebdavBackupVersions: vi.fn(),
  createWebdavBackup: vi.fn(),
  restoreWebdavBackup: vi.fn(),
}))
import { createWebdavBackup, listWebdavBackupVersions, restoreWebdavBackup } from './webdavBackup'
import { createWebdavBackupManager } from './webdavBackupManager'

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
describe('long backup schedules', () => {
  it.each([7, 30, 365])('does not back up early with a %i day interval', async (days) => {
    vi.useFakeTimers()
    const start = Date.now()
    const config = appConfigSchema.parse({
      system: {
        webdavBackup: {
          autoBackup: true,
          intervalDays: days,
          url: 'https://example.com/dav',
          username: 'test',
          password: 'fixture',
        },
      },
    })
    let lastBackup = start
    vi.mocked(listWebdavBackupVersions).mockImplementation(async () => [
      { id: 'last', filename: 'last.json', size: 1, createdAt: new Date(lastBackup).toISOString() },
    ])
    vi.mocked(createWebdavBackup).mockImplementation(async () => {
      lastBackup = Date.now()
      return {
        version: {
          id: 'next',
          filename: 'next.json',
          size: 1,
          createdAt: new Date(lastBackup).toISOString(),
        },
        removedVersionIds: [],
      }
    })
    const options = {
      readAppConfig: async () => config,
      readSystemConfig: async () => config.system,
      commitRestoredConfig: async () => ({ restoredConfig: config, requiresReauth: false }),
      logger: { info() {}, warn() {}, error() {} },
    }
    let manager = createWebdavBackupManager(options)
    await manager.reloadSchedule()
    await vi.advanceTimersByTimeAsync(days * 86_400_000 - 1)
    expect(createWebdavBackup).not.toHaveBeenCalled()
    manager.stop()
    manager = createWebdavBackupManager(options)
    await manager.reloadSchedule()
    await vi.advanceTimersByTimeAsync(1)
    expect(createWebdavBackup).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(createWebdavBackup).toHaveBeenCalledTimes(1)
    manager.stop()
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const quietLogger = { info() {}, warn() {}, error() {} }
const backupConfig = () =>
  appConfigSchema.parse({
    system: {
      webdavBackup: {
        url: 'https://example.com/dav',
        username: 'fixture',
        password: 'fixture',
        autoBackup: true,
      },
    },
  })

describe('backup commit and shutdown boundaries', () => {
  it('returns a committed restore without waiting for remote scheduling', async () => {
    const config = backupConfig()
    const release = deferred<never[]>()
    vi.mocked(restoreWebdavBackup).mockResolvedValue(config)
    vi.mocked(listWebdavBackupVersions).mockReturnValue(release.promise)
    const commit = vi.fn(async () => ({ restoredConfig: config, requiresReauth: true }))
    const manager = createWebdavBackupManager({
      readAppConfig: async () => config,
      readSystemConfig: async () => config.system,
      commitRestoredConfig: commit,
      logger: quietLogger,
    })
    const result = await manager.restoreVersion('fixture-version')
    expect(result.requiresReauth).toBe(true)
    expect(commit).toHaveBeenCalledTimes(1)
    const stopped = manager.stop()
    release.resolve([])
    await stopped
  })

  it('cancels remote work before a restore may enter local commit', async () => {
    const config = backupConfig()
    const started = deferred<void>()
    vi.mocked(restoreWebdavBackup).mockImplementation(async (_settings, _id, options) => {
      started.resolve()
      return new Promise((_resolve, reject) =>
        options?.signal?.addEventListener('abort', () => reject(new Error('cancelled')))
      )
    })
    const commit = vi.fn(async () => ({ restoredConfig: config, requiresReauth: false }))
    const manager = createWebdavBackupManager({
      readAppConfig: async () => config,
      readSystemConfig: async () => config.system,
      commitRestoredConfig: commit,
      logger: quietLogger,
    })
    const pending = manager.restoreVersion('fixture-version')
    const rejected = expect(pending).rejects.toThrow('cancelled')
    await started.promise
    await manager.stop()
    await rejected
    expect(commit).not.toHaveBeenCalled()
  })

  it('waits for an already started local commit and does not restart scheduling', async () => {
    const config = backupConfig()
    const started = deferred<void>()
    const release = deferred<void>()
    vi.mocked(restoreWebdavBackup).mockResolvedValue(config)
    const manager = createWebdavBackupManager({
      readAppConfig: async () => config,
      readSystemConfig: async () => config.system,
      logger: quietLogger,
      commitRestoredConfig: async (_value, canCommit) => {
        expect(canCommit()).toBe(true)
        started.resolve()
        await release.promise
        return { restoredConfig: config, requiresReauth: false }
      },
    })
    const pending = manager.restoreVersion('fixture-version')
    await started.promise
    let stopped = false
    const closing = manager.stop().then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)
    release.resolve()
    expect((await pending).restoredConfig).toEqual(config)
    await closing
    expect(listWebdavBackupVersions).not.toHaveBeenCalled()
  })

  it('rechecks settings changed while a schedule refresh was in flight', async () => {
    vi.useFakeTimers()
    const config = backupConfig()
    const first = deferred<never[]>()
    vi.mocked(listWebdavBackupVersions).mockReturnValue(first.promise)
    const manager = createWebdavBackupManager({
      readAppConfig: async () => config,
      readSystemConfig: async () => config.system,
      commitRestoredConfig: async () => ({ restoredConfig: config, requiresReauth: false }),
      logger: quietLogger,
    })
    const loading = manager.reloadSchedule()
    await Promise.resolve()
    await Promise.resolve()
    config.system.webdavBackup.autoBackup = false
    const changed = manager.reloadSchedule()
    first.resolve([])
    await Promise.all([loading, changed])
    await vi.advanceTimersByTimeAsync(86_400_000)
    expect(createWebdavBackup).not.toHaveBeenCalled()
    await manager.stop()
  })
})
