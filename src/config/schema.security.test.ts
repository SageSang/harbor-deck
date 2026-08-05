import { describe, expect, it } from 'vitest'
import { quickRecordSchema, serviceConfigSchema, webdavBackupConfigSchema } from '@/config/schema'

const unsafeUrls = [
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'file:///etc/passwd',
  'mailto:test@example.com',
]

describe('HTTP URL validation', () => {
  it.each(unsafeUrls)('rejects unsupported bookmark URL %s', (primaryUrl) => {
    expect(
      serviceConfigSchema.safeParse({
        slug: 'unsafe',
        name: 'Unsafe',
        primaryUrl,
      }).success
    ).toBe(false)
  })

  it.each(unsafeUrls)('rejects unsupported quick-record URL %s', (primaryUrl) => {
    expect(
      quickRecordSchema.safeParse({
        id: 'quick-unsafe',
        name: 'Unsafe',
        primaryUrl,
        createdAt: 1,
        updatedAt: 1,
      }).success
    ).toBe(false)
  })

  it('accepts HTTP and HTTPS bookmark URLs', () => {
    expect(
      serviceConfigSchema.safeParse({
        slug: 'safe',
        name: 'Safe',
        primaryUrl: 'http://192.168.1.2:8080',
        secondaryUrl: 'https://example.com/path',
      }).success
    ).toBe(true)
  })

  it.each(['javascript:alert(1)', 'file:///tmp/backup'])(
    'rejects unsupported WebDAV URL %s',
    (url) => {
      expect(
        webdavBackupConfigSchema.safeParse({
          url,
          username: 'user',
          password: 'password',
        }).success
      ).toBe(false)
    }
  )
})
