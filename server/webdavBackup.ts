import { Buffer } from 'node:buffer'
import { appConfigSchema, type AppConfig, type WebdavBackupConfig } from '../src/config/schema.js'

const BACKUP_FILENAME_PREFIX = 'harbor-deck-config-'
const BACKUP_FILENAME_PATTERN = /^harbor-deck-config-(\d{8}T\d{9}Z)\.json$/
const DIRECTORY_EXISTS_STATUS = new Set([200, 201, 204, 405])
const WEBDAV_REQUEST_TIMEOUT_MS = 15_000

type FetchLike = typeof fetch

export interface WebdavBackupVersion {
  id: string
  filename: string
  createdAt: string
  size: number | null
}

export interface WebdavBackupResult {
  version: WebdavBackupVersion
  removedVersionIds: string[]
  warnings?: string[]
}

interface WebdavRequestOptions {
  method: string
  headers?: Record<string, string>
  body?: string
}

function decodeXmlText(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
}

function readXmlTag(block: string, tagName: string) {
  const match = new RegExp(
    `<(?:[A-Za-z0-9_-]+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${tagName}>`,
    'i'
  ).exec(block)

  return match ? decodeXmlText(match[1].trim()) : null
}

function formatFilenameTimestamp(date: Date) {
  const year = `${date.getUTCFullYear()}`
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  const hour = `${date.getUTCHours()}`.padStart(2, '0')
  const minute = `${date.getUTCMinutes()}`.padStart(2, '0')
  const second = `${date.getUTCSeconds()}`.padStart(2, '0')
  const millisecond = `${date.getUTCMilliseconds()}`.padStart(3, '0')

  return `${year}${month}${day}T${hour}${minute}${second}${millisecond}Z`
}

function parseFilenameTimestamp(filename: string) {
  const match = BACKUP_FILENAME_PATTERN.exec(filename)
  if (!match) {
    return null
  }

  const [, value] = match
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(
    9,
    11
  )}:${value.slice(11, 13)}:${value.slice(13, 15)}.${value.slice(15, 18)}Z`
  const createdAt = new Date(iso)

  return Number.isNaN(createdAt.getTime()) ? null : createdAt.toISOString()
}

function createBackupFilename(date = new Date()) {
  return `${BACKUP_FILENAME_PREFIX}${formatFilenameTimestamp(date)}.json`
}

function normalizeRemoteSegments(remotePath: string) {
  const normalized = remotePath.trim().replaceAll('\\', '/')
  if (!normalized) {
    return [] as string[]
  }

  return normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      if (segment === '.' || segment === '..') {
        throw new Error('WebDAV 远程路径不能包含 . 或 ..')
      }

      return segment
    })
}

function getPathSegments(pathname: string) {
  return pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
}

function buildRemoteUrl(baseDirectoryUrl: URL, remoteSegments: string[], filename?: string) {
  const url = new URL(baseDirectoryUrl.toString())
  const pathSegments = [...getPathSegments(baseDirectoryUrl.pathname), ...remoteSegments]

  if (filename) {
    pathSegments.push(filename)
  }

  url.pathname =
    pathSegments.length === 0
      ? filename
        ? `/${encodeURIComponent(filename)}`
        : '/'
      : `/${pathSegments.map((segment) => encodeURIComponent(segment)).join('/')}${filename ? '' : '/'}`

  return url
}

function createDirectoryUrl(config: WebdavBackupConfig) {
  const url = new URL(config.url)
  url.search = ''
  url.hash = ''

  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`
  }

  return url
}

function createAuthHeaders(config: WebdavBackupConfig) {
  return {
    Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`,
  }
}

export function getWebdavRequestTimeoutMs() {
  const raw = process.env.HARBORDECK_WEBDAV_TIMEOUT_MS
  if (raw === undefined || raw.trim() === '') return WEBDAV_REQUEST_TIMEOUT_MS
  const timeout = Number(raw)
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 300_000) {
    throw new Error('HARBORDECK_WEBDAV_TIMEOUT_MS 必须是 100–300000 之间的整数')
  }
  return timeout
}

async function readResponseText(response: Response, signal: AbortSignal) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const cancel = () => {
    void reader.cancel(signal.reason).catch(() => undefined)
  }
  signal.addEventListener('abort', cancel, { once: true })
  const decoder = new TextDecoder()
  let text = ''
  try {
    signal.throwIfAborted()
    while (true) {
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done) return text + decoder.decode()
      text += decoder.decode(chunk.value, { stream: true })
    }
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}

async function requestWebdav(
  config: WebdavBackupConfig,
  url: URL,
  options: WebdavRequestOptions,
  fetchImpl: FetchLike,
  signal?: AbortSignal
) {
  const controller = new AbortController()
  const timeoutMs = getWebdavRequestTimeoutMs()
  let timedOut = false
  const cancel = () => controller.abort(new Error('WebDAV 操作已取消'))
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('WebDAV 请求超时'))
  }, timeoutMs)

  let response: Response | undefined
  try {
    controller.signal.throwIfAborted()
    response = await fetchImpl(url, {
      method: options.method,
      headers: { ...createAuthHeaders(config), ...(options.headers ?? {}) },
      body: options.body,
      signal: controller.signal,
    })
    controller.signal.throwIfAborted()
    const expectedStatuses: Record<string, number[]> = {
      GET: [200],
      PROPFIND: [207],
      MKCOL: [...DIRECTORY_EXISTS_STATUS],
      PUT: [200, 201, 204],
      DELETE: [200, 204],
    }
    const needsBody =
      options.method === 'GET' ||
      options.method === 'PROPFIND' ||
      !expectedStatuses[options.method]?.includes(response.status)
    const body = needsBody ? await readResponseText(response, controller.signal) : ''
    // Successful writes need no response body. Cancellation releases it without
    // making upload success depend on the server finishing an irrelevant stream.
    if (!needsBody) void response.body?.cancel().catch(() => undefined)
    return { status: response.status, text: async () => body }
  } catch (error) {
    if (timedOut) {
      const uncertain = ['PUT', 'DELETE', 'MKCOL'].includes(options.method)
        ? '；远端状态可能已变化，请先核对结果'
        : ''
      throw new Error(`WebDAV 请求超时（${timeoutMs / 1000} 秒）${uncertain}`)
    }
    if (signal?.aborted) throw new Error('WebDAV 操作已取消')
    throw error
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', cancel)
    if (response?.body && !response.bodyUsed) {
      void response.body.cancel().catch(() => undefined)
    }
  }
}

function createVersionFromFilename(
  filename: string,
  size: number | null,
  createdAt?: string | null
) {
  const derivedCreatedAt = parseFilenameTimestamp(filename)
  const resolvedCreatedAt = derivedCreatedAt ?? createdAt

  if (!resolvedCreatedAt) {
    return null
  }

  return {
    id: filename,
    filename,
    createdAt: resolvedCreatedAt,
    size,
  } satisfies WebdavBackupVersion
}

export function isWebdavBackupConfigured(config: WebdavBackupConfig) {
  return Boolean(config.url.trim() && config.username.trim() && config.password)
}

export function assertWebdavBackupConfigured(config: WebdavBackupConfig) {
  if (!isWebdavBackupConfigured(config)) {
    throw new Error('请先保存完整的 WebDAV 备份配置')
  }
}

async function ensureRemoteDirectory(
  config: WebdavBackupConfig,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal
) {
  const baseDirectoryUrl = createDirectoryUrl(config)
  const remoteSegments = normalizeRemoteSegments(config.remotePath)

  for (let index = 0; index < remoteSegments.length; index += 1) {
    const directoryUrl = buildRemoteUrl(baseDirectoryUrl, remoteSegments.slice(0, index + 1))
    const response = await requestWebdav(
      config,
      directoryUrl,
      {
        method: 'MKCOL',
      },
      fetchImpl,
      signal
    )

    if (!DIRECTORY_EXISTS_STATUS.has(response.status)) {
      const message = await response.text()
      throw new Error(
        `创建 WebDAV 目录失败（${response.status}）：${message || directoryUrl.toString()}`
      )
    }
  }

  return {
    baseDirectoryUrl,
    remoteSegments,
  }
}

function parseWebdavMultiStatus(xml: string, directoryUrl: URL) {
  const responseBlocks = xml.match(
    /<(?:[A-Za-z0-9_-]+:)?response\b[\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?response>/gi
  )

  if (!responseBlocks) {
    return [] as WebdavBackupVersion[]
  }

  const directoryPath = directoryUrl.pathname.endsWith('/')
    ? directoryUrl.pathname
    : `${directoryUrl.pathname}/`

  return responseBlocks
    .map((block) => {
      const href = readXmlTag(block, 'href')
      if (!href) {
        return null
      }

      const responseUrl = new URL(href, directoryUrl)
      if (!responseUrl.pathname.startsWith(directoryPath)) {
        return null
      }

      const relativePath = responseUrl.pathname.slice(directoryPath.length).replace(/\/+$/, '')
      if (!relativePath || relativePath.includes('/')) {
        return null
      }

      const resourceType = readXmlTag(block, 'resourcetype')
      if (resourceType?.includes('collection')) {
        return null
      }

      const filename = decodeURIComponent(relativePath)
      if (!filename.startsWith(BACKUP_FILENAME_PREFIX) || !filename.endsWith('.json')) {
        return null
      }

      const sizeText = readXmlTag(block, 'getcontentlength')
      const lastModified = readXmlTag(block, 'getlastmodified')
      const parsedSize = sizeText ? Number.parseInt(sizeText, 10) : Number.NaN
      const parsedModified = lastModified ? new Date(lastModified) : null
      const createdAt =
        parsedModified && !Number.isNaN(parsedModified.getTime())
          ? parsedModified.toISOString()
          : null

      return createVersionFromFilename(
        filename,
        Number.isNaN(parsedSize) ? null : parsedSize,
        createdAt
      )
    })
    .filter((item): item is WebdavBackupVersion => Boolean(item))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function listWebdavBackupVersions(
  config: WebdavBackupConfig,
  options?: {
    fetchImpl?: FetchLike
    signal?: AbortSignal
  }
) {
  assertWebdavBackupConfigured(config)

  const fetchImpl = options?.fetchImpl ?? fetch
  const { baseDirectoryUrl, remoteSegments } = await ensureRemoteDirectory(
    config,
    fetchImpl,
    options?.signal
  )
  const directoryUrl = buildRemoteUrl(baseDirectoryUrl, remoteSegments)
  const response = await requestWebdav(
    config,
    directoryUrl,
    {
      method: 'PROPFIND',
      headers: {
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:">
  <prop>
    <getcontentlength />
    <getlastmodified />
    <resourcetype />
  </prop>
</propfind>`,
    },
    fetchImpl,
    options?.signal
  )

  if (response.status !== 207) {
    const message = await response.text()
    throw new Error(`读取 WebDAV 备份版本失败（${response.status}）：${message || '未知错误'}`)
  }

  return parseWebdavMultiStatus(await response.text(), directoryUrl)
}

async function deleteWebdavBackupFile(
  config: WebdavBackupConfig,
  versionId: string,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal
) {
  if (!BACKUP_FILENAME_PATTERN.test(versionId)) {
    throw new Error('无效的备份版本标识')
  }

  const baseDirectoryUrl = createDirectoryUrl(config)
  const remoteSegments = normalizeRemoteSegments(config.remotePath)
  const fileUrl = buildRemoteUrl(baseDirectoryUrl, remoteSegments, versionId)
  const response = await requestWebdav(
    config,
    fileUrl,
    {
      method: 'DELETE',
    },
    fetchImpl,
    signal
  )

  if (![200, 204].includes(response.status)) {
    const message = await response.text()
    throw new Error(`删除旧的 WebDAV 备份失败（${response.status}）：${message || versionId}`)
  }
}

export async function createWebdavBackup(
  config: WebdavBackupConfig,
  appConfig: AppConfig,
  options?: {
    fetchImpl?: FetchLike
    signal?: AbortSignal
    now?: Date
  }
) {
  assertWebdavBackupConfigured(config)

  const fetchImpl = options?.fetchImpl ?? fetch
  const now = options?.now ?? new Date()
  const { baseDirectoryUrl, remoteSegments } = await ensureRemoteDirectory(
    config,
    fetchImpl,
    options?.signal
  )
  const filename = createBackupFilename(now)
  const fileUrl = buildRemoteUrl(baseDirectoryUrl, remoteSegments, filename)
  const body = `${JSON.stringify(appConfig, null, 2)}\n`
  const response = await requestWebdav(
    config,
    fileUrl,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body,
    },
    fetchImpl,
    options?.signal
  )

  if (![200, 201, 204].includes(response.status)) {
    const message = await response.text()
    throw new Error(`上传 WebDAV 备份失败（${response.status}）：${message || filename}`)
  }

  let version = createVersionFromFilename(
    filename,
    Buffer.byteLength(body, 'utf8'),
    now.toISOString()
  )!
  const removedVersionIds: string[] = []
  const warnings: string[] = []
  try {
    const versions = await listWebdavBackupVersions(config, { fetchImpl, signal: options?.signal })
    version = versions.find((item) => item.id === filename) ?? version
    for (const oldVersion of versions.slice(config.maxVersions)) {
      await deleteWebdavBackupFile(config, oldVersion.id, fetchImpl, options?.signal)
      removedVersionIds.push(oldVersion.id)
    }
  } catch (error) {
    warnings.push(
      `备份已上传，但版本核对或清理未完成：${error instanceof Error ? error.message : '未知错误'}`
    )
  }
  return {
    version,
    removedVersionIds,
    ...(warnings.length ? { warnings } : {}),
  } satisfies WebdavBackupResult
}

export async function restoreWebdavBackup(
  config: WebdavBackupConfig,
  versionId: string,
  options?: {
    fetchImpl?: FetchLike
    signal?: AbortSignal
  }
) {
  assertWebdavBackupConfigured(config)

  if (!BACKUP_FILENAME_PATTERN.test(versionId)) {
    throw new Error('无效的备份版本标识')
  }

  const fetchImpl = options?.fetchImpl ?? fetch
  const baseDirectoryUrl = createDirectoryUrl(config)
  const remoteSegments = normalizeRemoteSegments(config.remotePath)
  const fileUrl = buildRemoteUrl(baseDirectoryUrl, remoteSegments, versionId)
  const response = await requestWebdav(
    config,
    fileUrl,
    {
      method: 'GET',
    },
    fetchImpl,
    options?.signal
  )

  if (response.status !== 200) {
    const message = await response.text()
    throw new Error(`读取 WebDAV 备份失败（${response.status}）：${message || versionId}`)
  }

  let json: unknown
  try {
    json = JSON.parse(await response.text())
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    throw new Error(`远端备份文件不是合法 JSON：${message}`)
  }

  return appConfigSchema.parse(json)
}
