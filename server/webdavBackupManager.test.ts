// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appConfigSchema } from '../src/config/schema'
vi.mock('./webdavBackup', () => ({
  isWebdavBackupConfigured: () => true,
  listWebdavBackupVersions: vi.fn(),
  createWebdavBackup: vi.fn(),
}))
import { createWebdavBackup, listWebdavBackupVersions } from './webdavBackup'
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
      writeAppConfig: async () => config,
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
