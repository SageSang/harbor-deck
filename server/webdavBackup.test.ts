// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { appConfigSchema, type AppConfig, type WebdavBackupConfig } from '../src/config/schema.js'
import {
  createWebdavBackup,
  listWebdavBackupVersions,
  restoreWebdavBackup,
} from './webdavBackup.js'

interface StoredFile {
  body: string
  updatedAt: Date
}

const AUTH_HEADER = `Basic ${Buffer.from('demo-user:demo-pass').toString('base64')}`

function normalizeDirectoryPath(pathname: string) {
  const decoded = decodeURIComponent(pathname)
  return decoded.endsWith('/') ? decoded : `${decoded}/`
}

function normalizeFilePath(pathname: string) {
  return decodeURIComponent(pathname)
}

function getParentDirectory(pathname: string) {
  const normalized = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  const separatorIndex = normalized.lastIndexOf('/')

  return separatorIndex <= 0 ? '/' : `${normalized.slice(0, separatorIndex + 1)}`
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function createFetchImpl() {
  const directories = new Set<string>(['/', '/dav-root/'])
  const files = new Map<string, StoredFile>()

  const fetchImpl: typeof fetch = async (input, init) => {
    const requestUrl =
      typeof input === 'string' || input instanceof URL ? new URL(input) : new URL(input.url)
    const method = init?.method ?? 'GET'
    const authorization =
      init?.headers instanceof Headers
        ? init.headers.get('Authorization')
        : Array.isArray(init?.headers)
          ? init?.headers.find(([key]) => key.toLowerCase() === 'authorization')?.[1]
          : (init?.headers as Record<string, string> | undefined)?.Authorization

    if (authorization !== AUTH_HEADER) {
      return new Response('Unauthorized', { status: 401 })
    }

    if (method === 'MKCOL') {
      const directoryPath = normalizeDirectoryPath(requestUrl.pathname)
      const parentDirectory = getParentDirectory(directoryPath)

      if (!directories.has(parentDirectory)) {
        return new Response('Parent missing', { status: 409 })
      }

      if (directories.has(directoryPath)) {
        return new Response('Already exists', { status: 405 })
      }

      directories.add(directoryPath)
      return new Response(null, { status: 201 })
    }

    if (method === 'PUT') {
      const filePath = normalizeFilePath(requestUrl.pathname)
      const parentDirectory = getParentDirectory(filePath)

      if (!directories.has(parentDirectory)) {
        return new Response('Parent missing', { status: 409 })
      }

      files.set(filePath, {
        body: typeof init?.body === 'string' ? init.body : '',
        updatedAt: new Date(),
      })

      return new Response(null, { status: 201 })
    }

    if (method === 'GET') {
      const filePath = normalizeFilePath(requestUrl.pathname)
      const file = files.get(filePath)

      if (!file) {
        return new Response('Not found', { status: 404 })
      }

      return new Response(file.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      })
    }

    if (method === 'DELETE') {
      const filePath = normalizeFilePath(requestUrl.pathname)

      if (!files.has(filePath)) {
        return new Response('Not found', { status: 404 })
      }

      files.delete(filePath)
      return new Response(null, { status: 204 })
    }

    if (method === 'PROPFIND') {
      const directoryPath = normalizeDirectoryPath(requestUrl.pathname)
      if (!directories.has(directoryPath)) {
        return new Response('Not found', { status: 404 })
      }

      const children = [...files.entries()]
        .filter(([filePath]) => getParentDirectory(filePath) === directoryPath)
        .map(([filePath, file]) => {
          const href = escapeXml(filePath)
          return `
  <d:response>
    <d:href>${href}</d:href>
    <d:propstat>
      <d:prop>
        <d:getcontentlength>${Buffer.byteLength(file.body, 'utf8')}</d:getcontentlength>
        <d:getlastmodified>${file.updatedAt.toUTCString()}</d:getlastmodified>
        <d:resourcetype></d:resourcetype>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>`
        })
        .join('')

      return new Response(
        `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>${escapeXml(directoryPath)}</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection /></d:resourcetype>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>${children}
</d:multistatus>`,
        {
          status: 207,
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
          },
        }
      )
    }

    return new Response('Unsupported method', { status: 405 })
  }

  return {
    directories,
    files,
    fetchImpl,
  }
}

function createAppConfig(baseUrl: string, webdavBackup: Partial<WebdavBackupConfig>): AppConfig {
  return appConfigSchema.parse({
    system: {
      appName: 'HarborDeck Test',
      darkMode: false,
      clickOpenTarget: 'self',
      middleClickOpenTarget: 'blank',
      defaultSearchEngine: 'google',
      customSearchEngines: [],
      webdavBackup: {
        url: `${baseUrl}/dav-root`,
        username: 'demo-user',
        password: 'demo-pass',
        remotePath: '/nested/backups',
        autoBackup: false,
        intervalDays: 7,
        maxVersions: 2,
        ...webdavBackup,
      },
    },
    services: [],
  })
}

describe('webdav backup helpers', () => {
  it('creates nested remote folders and trims old versions after backup', async () => {
    const baseUrl = 'https://dav.example.test'
    const { directories, files, fetchImpl } = createFetchImpl()
    const firstConfig = createAppConfig(baseUrl, {})
    const secondConfig = createAppConfig(baseUrl, {
      autoBackup: true,
    })
    const thirdConfig = createAppConfig(baseUrl, {
      maxVersions: 2,
    })

    await createWebdavBackup(firstConfig.system.webdavBackup, firstConfig, {
      fetchImpl,
      now: new Date('2026-03-09T00:00:00.000Z'),
    })
    await createWebdavBackup(secondConfig.system.webdavBackup, secondConfig, {
      fetchImpl,
      now: new Date('2026-03-10T00:00:00.000Z'),
    })
    const thirdResult = await createWebdavBackup(thirdConfig.system.webdavBackup, thirdConfig, {
      fetchImpl,
      now: new Date('2026-03-11T00:00:00.000Z'),
    })

    const versions = await listWebdavBackupVersions(thirdConfig.system.webdavBackup, { fetchImpl })

    expect(directories.has('/dav-root/nested/')).toBe(true)
    expect(directories.has('/dav-root/nested/backups/')).toBe(true)
    expect(thirdResult.removedVersionIds).toHaveLength(1)
    expect(versions).toHaveLength(2)
    expect(versions[0]?.filename).toContain('20260311T000000000Z')
    expect(versions[1]?.filename).toContain('20260310T000000000Z')
    expect([...files.keys()].some((filePath) => filePath.includes('20260309T000000000Z'))).toBe(
      false
    )
  })

  it('restores a saved backup version from WebDAV', async () => {
    const baseUrl = 'https://dav.example.test'
    const { fetchImpl } = createFetchImpl()
    const config = createAppConfig(baseUrl, {
      remotePath: '/restore-check',
      maxVersions: 5,
    })
    const created = await createWebdavBackup(config.system.webdavBackup, config, {
      fetchImpl,
      now: new Date('2026-03-12T08:30:00.000Z'),
    })

    const restored = await restoreWebdavBackup(config.system.webdavBackup, created.version.id, {
      fetchImpl,
    })

    expect(restored).toEqual(config)
  })

  it('aborts a WebDAV request that never responds', async () => {
    vi.useFakeTimers()
    try {
      const config = createAppConfig('https://dav.example.test', {})
      const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
      }) as typeof fetch

      const request = listWebdavBackupVersions(config.system.webdavBackup, { fetchImpl })
      const expectation = expect(request).rejects.toThrow('WebDAV 请求超时（15 秒）')
      await vi.advanceTimersByTimeAsync(15_000)
      await expectation
    } finally {
      vi.useRealTimers()
    }
  })
})
