import { z } from 'zod'
import { appConfigSchema } from '@/config/schema'
import { getCurrentMessages } from '@/i18n/runtime'
import { requestJson } from '@/features/config/api'

const webdavBackupVersionSchema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1),
  createdAt: z.string().datetime(),
  size: z.number().int().nullable(),
})

const runWebdavBackupResponseSchema = z.object({
  version: webdavBackupVersionSchema,
  removedVersionIds: z.array(z.string()),
  warnings: z.array(z.string()).optional().default([]),
})

const restoreWebdavBackupResponseSchema = z.object({
  requiresReauth: z.boolean(),
  restoredConfig: appConfigSchema,
})

export type WebdavBackupVersion = z.infer<typeof webdavBackupVersionSchema>
export type RunWebdavBackupResponse = z.infer<typeof runWebdavBackupResponseSchema>
export type RestoreWebdavBackupResponse = z.infer<typeof restoreWebdavBackupResponseSchema>

export const webdavBackupVersionsQueryKey = ['backups', 'webdav', 'versions'] as const

export async function fetchWebdavBackupVersions(): Promise<WebdavBackupVersion[]> {
  const messages = getCurrentMessages()
  const data = await requestJson<unknown>('/api/backups/webdav/versions', {
    fallbackMessage: messages.errors.loadWebdavBackupVersionsFailed,
  })

  return z.array(webdavBackupVersionSchema).parse(data)
}

export async function runWebdavBackup(): Promise<RunWebdavBackupResponse> {
  const messages = getCurrentMessages()
  const data = await requestJson<unknown>('/api/backups/webdav/run', {
    method: 'POST',
    body: JSON.stringify({}),
    fallbackMessage: messages.errors.runWebdavBackupFailed,
  })

  return runWebdavBackupResponseSchema.parse(data)
}

export async function restoreWebdavBackup(versionId: string): Promise<RestoreWebdavBackupResponse> {
  const messages = getCurrentMessages()
  const data = await requestJson<unknown>('/api/backups/webdav/restore', {
    method: 'POST',
    body: JSON.stringify({ versionId }),
    fallbackMessage: messages.errors.restoreWebdavBackupFailed,
  })

  return restoreWebdavBackupResponseSchema.parse(data)
}
