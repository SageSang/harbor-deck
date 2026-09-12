import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'
import fastifyStatic from '@fastify/static'
import { ZodError, z } from 'zod'
import {
  appConfigSchema,
  storedNavigationConfigSchema,
  type AppConfig,
  type NavigationConfig,
  type NavigationSceneConfig,
} from '../src/config/schema.js'
import {
  readAppConfig,
  readNavigationConfig,
  readSystemConfig,
  mutateAppConfig,
  mutateNavigationConfig,
  commitRestoredAppConfig,
  commitScenePasswordConfig,
  inspectAppConfig,
} from './configStore.js'
import { createAuthService } from './auth.js'
import { createWebdavBackupManager } from './webdavBackupManager.js'
import { createSceneAccessService } from './sceneAccess.js'
import { hashPassword, verifyPassword } from './password.js'
import type { PasswordAttemptResult } from './passwordAttempts.js'
import {
  createIntegrationBookmark,
  getIntegrationTokenStatus,
  integrationBookmarkLookupQuerySchema,
  integrationBookmarkBodySchema,
  isIntegrationTokenValid,
  lookupIntegrationBookmark,
  readIntegrationTokenHeader,
  searchNavigationBookmarks,
} from './integrationApi.js'
import { normalizeAppSkin } from '../shared/theme.js'
import {
  createGroupExpansionPreference,
  getGroupKey,
} from '../src/features/navigation/groupExpansion.js'
import { registerBookmarkManagementApi } from './bookmarkManagementApi.js'
import { BookmarkManagementError, getNavigationRevision } from './bookmarkManagementService.js'

class NavigationRevisionMismatchError extends Error {}

function getIfMatchRevision(request: FastifyRequest) {
  const value = request.headers['if-match']
  const header = Array.isArray(value) ? value[0] : value
  return header?.trim().replace(/^W\//, '').replace(/^"|"$/g, '')
}

function navigationEtag(navigation: NavigationConfig) {
  return `"${getNavigationRevision(navigation)}"`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getSceneWithoutPassword(scene: NavigationSceneConfig) {
  const sanitized = { ...scene }
  delete sanitized.passwordHash
  return sanitized
}

function protectedSceneChanged(
  currentNavigation: NavigationConfig,
  nextNavigation: NavigationConfig,
  currentScene: NavigationSceneConfig
) {
  const nextScene = nextNavigation.scenes.find((scene) => scene.id === currentScene.id)
  if (!nextScene) {
    return true
  }
  if (
    JSON.stringify(getSceneWithoutPassword(currentScene)) !==
    JSON.stringify(getSceneWithoutPassword(nextScene))
  ) {
    return true
  }

  const referencedBookmarkIds = new Set(currentScene.groups.flatMap((group) => group.bookmarkIds))
  const currentBookmarks = new Map(
    currentNavigation.bookmarks.map((bookmark) => [bookmark.slug, bookmark])
  )
  const nextBookmarks = new Map(
    nextNavigation.bookmarks.map((bookmark) => [bookmark.slug, bookmark])
  )

  return Array.from(referencedBookmarkIds).some(
    (bookmarkId) =>
      JSON.stringify(currentBookmarks.get(bookmarkId)) !==
      JSON.stringify(nextBookmarks.get(bookmarkId))
  )
}

function systemRevision(system: Awaited<ReturnType<typeof readSystemConfig>>) {
  const value = { ...system }
  delete value._revision
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function appRevision(config: AppConfig) {
  return `${getNavigationRevision(config.navigation)}/${systemRevision(config.system)}`
}

function sanitizeSystemConfig(system: Awaited<ReturnType<typeof readSystemConfig>>) {
  const sanitized = { ...system }
  delete sanitized.auth
  sanitized._revision = systemRevision(system)
  return sanitized
}

function sanitizeAppConfig(
  config: Awaited<ReturnType<typeof readAppConfig>>,
  canRead: (sceneId: string) => boolean
) {
  const sanitized = {
    ...config,
    system: sanitizeSystemConfig(config.system),
    navigation: sanitizeNavigationConfig(config.navigation, canRead),
  }
  delete sanitized.uiPreferences
  return sanitized
}

function sanitizeNavigationConfig(
  navigation: NavigationConfig,
  canRead: (sceneId: string) => boolean
) {
  const hiddenIds = new Set<string>()
  const visibleIds = new Set<string>()
  const scenes = navigation.scenes.map((scene) => {
    const hidden = scene.protected && !canRead(scene.id)
    scene.groups.forEach((group) =>
      group.bookmarkIds.forEach((id) => (hidden ? hiddenIds : visibleIds).add(id))
    )
    return hidden
      ? { id: scene.id, name: scene.name, protected: true, groups: [], quickRecords: [] }
      : getSceneWithoutPassword(scene)
  })
  return {
    ...navigation,
    _revision: getNavigationRevision(navigation),
    scenes,
    bookmarks: navigation.bookmarks.filter(
      (bookmark) => !hiddenIds.has(bookmark.slug) || visibleIds.has(bookmark.slug)
    ),
  }
}

function resolveSceneServices(
  navigation: Awaited<ReturnType<typeof readNavigationConfig>>,
  sceneId: string
) {
  const scene = navigation.scenes.find((item) => item.id === sceneId)
  if (!scene) {
    return []
  }
  const bookmarksById = new Map(navigation.bookmarks.map((bookmark) => [bookmark.slug, bookmark]))
  return scene.groups.map((group) => ({
    category: group.name,
    items: group.bookmarkIds.flatMap((bookmarkId) => {
      const bookmark = bookmarksById.get(bookmarkId)
      return bookmark ? [bookmark] : []
    }),
  }))
}

function mergeSystemAuth(
  systemPayload: unknown,
  auth: Awaited<ReturnType<typeof readSystemConfig>>['auth']
) {
  if (!auth || !isRecord(systemPayload)) {
    return systemPayload
  }

  return {
    ...systemPayload,
    auth,
  }
}

function mergeAppAuth(
  appPayload: unknown,
  auth: Awaited<ReturnType<typeof readSystemConfig>>['auth']
) {
  if (!auth || !isRecord(appPayload)) {
    return appPayload
  }

  return {
    ...appPayload,
    system: mergeSystemAuth(appPayload.system, auth),
  }
}

function mergeNavigationPasswords(
  navigationPayload: unknown,
  currentNavigation: Awaited<ReturnType<typeof readNavigationConfig>>,
  canRead: (sceneId: string) => boolean
) {
  if (!isRecord(navigationPayload)) {
    return navigationPayload
  }

  // The Web snapshot contains placeholders for locked scenes. Preserve their
  // server-owned content while rejecting attempts to change those placeholders.
  const visible = sanitizeNavigationConfig(currentNavigation, canRead)
  const visibleIds = new Set(visible.bookmarks.map((bookmark) => bookmark.slug))
  const hiddenBookmarks = currentNavigation.bookmarks.filter(
    (bookmark) => !visibleIds.has(bookmark.slug)
  )
  const hiddenIds = new Set(hiddenBookmarks.map((bookmark) => bookmark.slug))
  const incomingScenes = Array.isArray(navigationPayload.scenes)
    ? [...navigationPayload.scenes]
    : []
  currentNavigation.scenes.forEach((scene) => {
    if (!scene.protected || canRead(scene.id)) return
    const index = incomingScenes.findIndex((item) => isRecord(item) && item.id === scene.id)
    const incoming = incomingScenes[index]
    if (
      !isRecord(incoming) ||
      incoming.name !== scene.name ||
      incoming.protected !== true ||
      !Array.isArray(incoming.groups) ||
      incoming.groups.length !== 0 ||
      (Array.isArray(incoming.quickRecords) && incoming.quickRecords.length !== 0) ||
      incoming.passwordHash !== undefined
    ) {
      throw new BookmarkManagementError(
        403,
        'PROTECTED_SCENE_LOCKED',
        `请先解锁场景“${scene.name}”`
      )
    }
    incomingScenes[index] = scene
  })
  const incomingBookmarks = Array.isArray(navigationPayload.bookmarks)
    ? navigationPayload.bookmarks
    : []
  if (
    incomingBookmarks.some((bookmark) => isRecord(bookmark) && hiddenIds.has(String(bookmark.slug)))
  ) {
    throw new BookmarkManagementError(403, 'PROTECTED_SCENE_LOCKED', '书签属于锁定场景，请先解锁')
  }
  navigationPayload = {
    ...navigationPayload,
    scenes: incomingScenes,
    bookmarks: [...incomingBookmarks, ...hiddenBookmarks],
  }
  if (!isRecord(navigationPayload)) return navigationPayload

  const passwordHashes = new Map(
    currentNavigation.scenes.map((scene) => [scene.id, scene.passwordHash])
  )
  const scenes = Array.isArray(navigationPayload.scenes)
    ? navigationPayload.scenes.map((scene) => {
        if (!isRecord(scene) || typeof scene.id !== 'string') {
          return scene
        }
        const passwordHash = passwordHashes.get(scene.id)
        return passwordHash ? { ...scene, protected: true, passwordHash } : scene
      })
    : navigationPayload.scenes

  return {
    ...navigationPayload,
    scenes,
  }
}

function mergeAppSecrets(
  appPayload: unknown,
  currentConfig: Awaited<ReturnType<typeof readAppConfig>>,
  canRead: (sceneId: string) => boolean
) {
  const withAuth = mergeAppAuth(appPayload, currentConfig.system.auth)
  if (!isRecord(withAuth)) {
    return withAuth
  }
  const withPreferences = { ...withAuth }
  if (currentConfig.uiPreferences) {
    withPreferences.uiPreferences = currentConfig.uiPreferences
  } else {
    delete withPreferences.uiPreferences
  }
  return {
    ...withPreferences,
    navigation: mergeNavigationPasswords(
      withPreferences.navigation,
      currentConfig.navigation,
      canRead
    ),
  }
}

function getTrustProxySetting(): boolean | string[] {
  const value = process.env.HARBORDECK_TRUST_PROXY?.trim()
  if (!value || value === '0' || value.toLowerCase() === 'false') {
    return false
  }
  if (value === '1' || value.toLowerCase() === 'true') {
    return true
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function getTrustedExtensionSources() {
  const value = process.env.HARBORDECK_TRUSTED_EXTENSION_IDS?.trim()
  if (!value) return []
  const ids = value.split(',').map((id) => id.trim())
  if (ids.some((id) => !/^[a-p]{32}$/.test(id))) {
    throw new Error('HARBORDECK_TRUSTED_EXTENSION_IDS 必须是逗号分隔的有效 Chrome 扩展 ID')
  }
  return [...new Set(ids)].map((id) => `chrome-extension://${id}`)
}

async function buildContentSecurityPolicy() {
  const scriptSources = ["'self'"]

  if (isProduction) {
    try {
      const indexHtml = await readFile(path.join(clientDistDir, 'index.html'), 'utf8')
      const inlineScripts = indexHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)
      for (const match of inlineScripts) {
        if (/\bsrc\s*=/i.test(match[1])) continue
        const digest = createHash('sha256').update(match[2]).digest('base64')
        scriptSources.push(`'sha256-${digest}'`)
      }
    } catch {
      // The production build validates the generated CSP after dist exists.
    }
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: http: https:",
    "font-src 'self' data:",
    "connect-src 'self' http: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

function applySecurityHeaders(
  request: FastifyRequest,
  reply: { header: (name: string, value: string) => unknown },
  contentSecurityPolicy: string
) {
  reply.header('X-Content-Type-Options', 'nosniff')
  reply.header('Referrer-Policy', 'same-origin')
  reply.header('Content-Security-Policy', contentSecurityPolicy)
  reply.header('X-Frame-Options', 'DENY')
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  if (request.protocol === 'https') {
    reply.header('Strict-Transport-Security', 'max-age=31536000')
  }

  if (request.url.startsWith('/api/')) {
    reply.header('Cache-Control', 'no-store')
    reply.header('Pragma', 'no-cache')
  }

  if (request.url.startsWith('/api/integrations/')) {
    reply.header('Vary', 'X-HarborDeck-Search-Token')
  }

  if (request.url.startsWith('/api/management/')) {
    reply.header('Vary', 'X-HarborDeck-Management-Token')
  }
}

const isProduction = process.env.NODE_ENV === 'production'
const clientDistDir = path.resolve(process.cwd(), 'dist')
const restoreWebdavBackupBodySchema = z.object({
  versionId: z.string().trim().min(1),
})
const sceneIdParamsSchema = z.object({ sceneId: z.string().trim().min(1) })
const sceneNavigationQuerySchema = z.object({ sceneId: z.string().trim().min(1).optional() })
const sceneUnlockBodySchema = z.object({ password: z.string().min(1).max(128) })
const scenePasswordBodySchema = z.object({
  password: z.string().min(6).max(128).nullable(),
})
const groupIdParamsSchema = z.object({
  sceneId: z.string().trim().min(1),
  groupId: z.string().trim().min(1),
})
const groupExpandedBodySchema = z.object({ expanded: z.boolean() })
const groupExpansionInitializeBodySchema = z.object({
  expandedGroupKeys: z.array(z.string().trim().min(1)).max(10_000),
})
const integrationSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  sceneId: z.string().trim().min(1).optional(),
})

function isIntegrationRequestAuthorized(request: FastifyRequest) {
  return isIntegrationTokenValid(readIntegrationTokenHeader(request.headers))
}

function getGroupExpansionResponse(config: AppConfig) {
  const preference = config.uiPreferences?.groupExpansion
  return {
    initialized: Boolean(preference),
    version: 1 as const,
    expandedGroupKeys: preference?.expandedGroupKeys ?? [],
  }
}

export async function buildServer() {
  const contentSecurityPolicy = await buildContentSecurityPolicy()
  const extensionSources = getTrustedExtensionSources()
  const embeddedSecurityPolicy = extensionSources.length
    ? contentSecurityPolicy.replace(
        "frame-ancestors 'none'",
        `frame-ancestors ${extensionSources.join(' ')}`
      )
    : contentSecurityPolicy
  const app = Fastify({
    // Legacy bookmark slugs can be longer than find-my-way's 100-character default.
    // Keep route-based management operations usable without changing the slug format.
    routerOptions: { maxParamLength: 256 },
    logger: {
      redact: ['req.headers.x-harbordeck-management-token'],
    },
    trustProxy: getTrustProxySetting(),
  })
  const authService = createAuthService()
  const sceneAccessService = createSceneAccessService()

  function getSuppliedSceneToken(request: FastifyRequest, sceneId: string) {
    const rawTokens = request.headers['x-scene-tokens']
    if (typeof rawTokens === 'string') {
      try {
        const parsed = JSON.parse(rawTokens)
        if (isRecord(parsed) && typeof parsed[sceneId] === 'string') {
          return parsed[sceneId]
        }
      } catch {
        return undefined
      }
    }
    const singleToken = request.headers['x-scene-token']
    return typeof singleToken === 'string' ? singleToken : undefined
  }

  function hasProtectedSceneAccess(
    request: FastifyRequest,
    sceneId: string,
    navigation: NavigationConfig
  ) {
    const sessionKey = authService.getSessionKey(request)
    return Boolean(
      sessionKey &&
      sceneAccessService.validate(
        getSuppliedSceneToken(request, sceneId),
        sessionKey,
        sceneId,
        navigation.scenes.find((scene) => scene.id === sceneId)?.passwordHash
      )
    )
  }

  function findUnauthorizedProtectedScene(
    request: FastifyRequest,
    currentNavigation: NavigationConfig,
    nextNavigation: NavigationConfig
  ) {
    const visibleIds = new Set(
      sanitizeNavigationConfig(currentNavigation, (id) =>
        hasProtectedSceneAccess(request, id, currentNavigation)
      ).bookmarks.map((bookmark) => bookmark.slug)
    )
    const hiddenIds = new Set(
      currentNavigation.bookmarks
        .filter((bookmark) => !visibleIds.has(bookmark.slug))
        .map((bookmark) => bookmark.slug)
    )
    nextNavigation.scenes.forEach((scene) => {
      const previousScene = currentNavigation.scenes.find((item) => item.id === scene.id)
      scene.groups.forEach((group) => {
        const previousIds = new Set(
          previousScene?.groups.find((item) => item.id === group.id)?.bookmarkIds ?? []
        )
        if (group.bookmarkIds.some((id) => hiddenIds.has(id) && !previousIds.has(id))) {
          throw new BookmarkManagementError(
            403,
            'PROTECTED_SCENE_LOCKED',
            '书签属于锁定场景，请先解锁'
          )
        }
      })
    })
    return currentNavigation.scenes.find(
      (scene) =>
        scene.protected &&
        protectedSceneChanged(currentNavigation, nextNavigation, scene) &&
        !hasProtectedSceneAccess(request, scene.id, currentNavigation)
    )
  }

  const webdavBackupManager = createWebdavBackupManager({
    readAppConfig,
    readSystemConfig,
    commitRestoredConfig: (value, canCommit) =>
      commitRestoredAppConfig(value, canCommit, (requiresReauth) => {
        if (requiresReauth) authService.invalidateAllSessions()
        sceneAccessService.clear()
      }),
    logger: app.log,
  })

  app.addHook('onListen', async () => {
    webdavBackupManager.start()
  })
  app.addHook('preClose', async () => {
    await webdavBackupManager.stop()
  })

  app.addHook('onSend', async (request, reply, payload) => {
    const url = new URL(request.url, 'http://localhost')
    const isEmbeddedHtml =
      ['/', '/index.html'].includes(url.pathname) &&
      url.searchParams.get('embedded') === '1' &&
      String(reply.getHeader('content-type') ?? '').startsWith('text/html')
    applySecurityHeaders(
      request,
      reply,
      isEmbeddedHtml ? embeddedSecurityPolicy : contentSecurityPolicy
    )
    return payload
  })

  app.addHook('onClose', async () => {
    sceneAccessService.clear()
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400)
      return reply.send(error.issues[0]?.message ?? '请求参数无效')
    }

    request.log.error(error)
    reply.code(500)
    return reply.send(request.url.startsWith('/api/') ? '服务器内部错误' : 'Internal Server Error')
  })

  await registerBookmarkManagementApi(app)

  app.get('/api/health', async () => ({ ok: true }))

  app.get('/api/integrations/bookmarks/search', async (request, reply) => {
    if (!getIntegrationTokenStatus()) {
      return reply.code(503).send('HARBORDECK_SEARCH_TOKEN is not configured')
    }
    if (!isIntegrationRequestAuthorized(request)) {
      return reply.code(401).send('Invalid integration token')
    }

    const query = integrationSearchQuerySchema.parse(request.query)
    const navigation = await readNavigationConfig()
    const scene =
      query.sceneId && query.sceneId !== 'all'
        ? navigation.scenes.find((item) => item.id === query.sceneId)
        : undefined
    if (query.sceneId && query.sceneId !== 'all' && !scene) {
      return reply.code(404).send('Scene not found')
    }

    return {
      query: query.q,
      sceneId: query.sceneId ?? null,
      results: searchNavigationBookmarks(navigation, query.q, query.sceneId),
    }
  })

  app.get('/api/integrations/bookmarks/scenes', async (request, reply) => {
    if (!getIntegrationTokenStatus()) {
      return reply.code(503).send('HARBORDECK_SEARCH_TOKEN is not configured')
    }
    if (!isIntegrationRequestAuthorized(request)) {
      return reply.code(401).send('Invalid integration token')
    }
    const navigation = await readNavigationConfig()
    const publicScenes = navigation.scenes.filter((scene) => !scene.protected)
    return {
      defaultSceneId:
        publicScenes.find((scene) => scene.id === navigation.defaultSceneId)?.id ??
        publicScenes[0]?.id ??
        '',
      scenes: publicScenes.map((scene) => ({
        id: scene.id,
        name: scene.name,
        groups: scene.groups.map((group) => ({ id: group.id, name: group.name })),
      })),
    }
  })

  app.get('/api/integrations/theme', async (request, reply) => {
    if (!getIntegrationTokenStatus()) {
      return reply.code(503).send('HARBORDECK_SEARCH_TOKEN is not configured')
    }
    if (!isIntegrationRequestAuthorized(request)) {
      return reply.code(401).send('Invalid integration token')
    }

    const system = await readSystemConfig()
    return { skin: normalizeAppSkin(system.skin) }
  })

  app.get('/api/integrations/bookmarks/lookup', async (request, reply) => {
    if (!getIntegrationTokenStatus()) {
      return reply.code(503).send('HARBORDECK_SEARCH_TOKEN is not configured')
    }
    if (!isIntegrationRequestAuthorized(request)) {
      return reply.code(401).send('Invalid integration token')
    }

    const query = integrationBookmarkLookupQuerySchema.parse(request.query)
    const navigation = await readNavigationConfig()
    return lookupIntegrationBookmark(navigation, query.url)
  })

  app.post('/api/integrations/bookmarks', async (request, reply) => {
    if (!getIntegrationTokenStatus()) {
      return reply.code(503).send('HARBORDECK_SEARCH_TOKEN is not configured')
    }
    if (!isIntegrationRequestAuthorized(request)) {
      return reply.code(401).send('Invalid integration token')
    }
    try {
      const body = integrationBookmarkBodySchema.parse(request.body)
      const { result } = await mutateNavigationConfig((navigation) => {
        const integrationResult = createIntegrationBookmark(navigation, body)
        return {
          navigation: integrationResult.navigation,
          result: integrationResult,
        }
      })
      return {
        created: result.created,
        bookmark: result.bookmark,
        ...(result.quickRecord ? { quickRecord: result.quickRecord } : {}),
        ...(result.recordSceneId ? { recordSceneId: result.recordSceneId } : {}),
        placements: result.placements,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to add bookmark'
      return reply.code(400).send(message)
    }
  })

  app.get('/api/auth/status', (request, reply) => authService.handleAuthStatus(request, reply))
  app.post('/api/auth/setup', (request, reply) => authService.handleSetup(request, reply))
  app.post('/api/auth/login', (request, reply) => authService.handleLogin(request, reply))
  app.post('/api/auth/logout', (request, reply) => authService.handleLogout(request, reply))
  app.put('/api/auth/credentials', (request, reply) =>
    authService.handleUpdateCredentials(request, reply)
  )

  app.get('/api/preferences/navigation/groups', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    return getGroupExpansionResponse(await readAppConfig())
  })

  app.post('/api/preferences/navigation/groups/initialize', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    const { expandedGroupKeys } = groupExpansionInitializeBodySchema.parse(request.body)
    const { appConfig: savedConfig } = await mutateAppConfig((current) => {
      if (current.uiPreferences?.groupExpansion) {
        return { appConfig: current, result: false }
      }

      return {
        appConfig: {
          ...current,
          uiPreferences: {
            ...current.uiPreferences,
            groupExpansion: createGroupExpansionPreference(current.navigation, expandedGroupKeys),
          },
        },
        result: true,
      }
    })

    return getGroupExpansionResponse(savedConfig)
  })

  app.put('/api/preferences/navigation/scenes/:sceneId/groups/:groupId', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    const { sceneId, groupId } = groupIdParamsSchema.parse(request.params)
    const { expanded } = groupExpandedBodySchema.parse(request.body)
    const { appConfig: savedConfig, result: found } = await mutateAppConfig((current) => {
      const scene = current.navigation.scenes.find((item) => item.id === sceneId)
      if (!scene?.groups.some((group) => group.id === groupId)) {
        return { appConfig: current, result: false }
      }

      const key = getGroupKey(sceneId, groupId)
      const expandedKeys = new Set(current.uiPreferences?.groupExpansion?.expandedGroupKeys ?? [])
      if (expanded) {
        expandedKeys.add(key)
      } else {
        expandedKeys.delete(key)
      }

      return {
        appConfig: {
          ...current,
          uiPreferences: {
            ...current.uiPreferences,
            groupExpansion: createGroupExpansionPreference(current.navigation, expandedKeys),
          },
        },
        result: true,
      }
    })

    if (!found) {
      return reply.code(404).send('场景或分组不存在')
    }
    return getGroupExpansionResponse(savedConfig)
  })

  app.put('/api/preferences/navigation/scenes/:sceneId/groups', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    const { sceneId } = sceneIdParamsSchema.parse(request.params)
    const { expanded } = groupExpandedBodySchema.parse(request.body)
    const { appConfig: savedConfig, result: found } = await mutateAppConfig((current) => {
      const scene = current.navigation.scenes.find((item) => item.id === sceneId)
      if (!scene) {
        return { appConfig: current, result: false }
      }

      const expandedKeys = new Set(current.uiPreferences?.groupExpansion?.expandedGroupKeys ?? [])
      scene.groups.forEach((group) => {
        const key = getGroupKey(scene.id, group.id)
        if (expanded) {
          expandedKeys.add(key)
        } else {
          expandedKeys.delete(key)
        }
      })

      return {
        appConfig: {
          ...current,
          uiPreferences: {
            ...current.uiPreferences,
            groupExpansion: createGroupExpansionPreference(current.navigation, expandedKeys),
          },
        },
        result: true,
      }
    })

    if (!found) {
      return reply.code(404).send('场景不存在')
    }
    return getGroupExpansionResponse(savedConfig)
  })

  app.get('/api/config/app', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    const config = await readAppConfig()
    reply.header('ETag', `"${appRevision(config)}"`)
    return sanitizeAppConfig(config, (id) =>
      hasProtectedSceneAccess(request, id, config.navigation)
    )
  })

  app.put('/api/config/app', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    const expectedRevision = getIfMatchRevision(request)
    if (!expectedRevision) {
      return reply.code(428).send('配置已启用并发保护，请重新加载后再保存')
    }

    try {
      const { appConfig: savedConfig } = await mutateAppConfig((currentConfig) => {
        if (appRevision(currentConfig) !== expectedRevision) {
          throw new NavigationRevisionMismatchError('导航状态已变化，请重新加载后再保存')
        }
        const nextConfig = mergeAppSecrets(request.body, currentConfig, (id) =>
          hasProtectedSceneAccess(request, id, currentConfig.navigation)
        )
        const parsedNextConfig = appConfigSchema.parse(nextConfig)
        const nextNavigation = storedNavigationConfigSchema.parse(parsedNextConfig.navigation)
        const unauthorizedScene = findUnauthorizedProtectedScene(
          request,
          currentConfig.navigation,
          nextNavigation
        )

        if (unauthorizedScene) {
          throw new BookmarkManagementError(
            403,
            'PROTECTED_SCENE_LOCKED',
            `请先解锁场景“${unauthorizedScene.name}”`
          )
        }
        return {
          appConfig: { ...parsedNextConfig, navigation: nextNavigation },
          result: null,
        }
      })
      void webdavBackupManager.reloadSchedule().catch((error) => app.log.error(error))
      reply.header('ETag', `"${appRevision(savedConfig)}"`)
      return sanitizeAppConfig(savedConfig, (id) =>
        hasProtectedSceneAccess(request, id, savedConfig.navigation)
      )
    } catch (error) {
      if (error instanceof NavigationRevisionMismatchError) {
        return reply.code(412).send(error.message)
      }
      if (error instanceof BookmarkManagementError)
        return reply.code(error.statusCode).send(error.message)
      const message = error instanceof Error ? error.message : '保存整站配置失败'
      reply.code(400)
      return message
    }
  })

  app.get('/api/config/navigation', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    const navigation = await readNavigationConfig()
    reply.header('ETag', navigationEtag(navigation))
    return sanitizeNavigationConfig(navigation, (id) =>
      hasProtectedSceneAccess(request, id, navigation)
    )
  })

  app.put('/api/config/navigation', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    const expectedRevision = getIfMatchRevision(request)
    if (!expectedRevision) {
      return reply.code(428).send('配置已启用并发保护，请重新加载后再保存')
    }

    try {
      const { navigation: savedNavigation } = await mutateNavigationConfig((currentNavigation) => {
        if (getNavigationRevision(currentNavigation) !== expectedRevision) {
          throw new NavigationRevisionMismatchError('导航状态已变化，请重新加载后再保存')
        }
        const nextNavigation = mergeNavigationPasswords(request.body, currentNavigation, (id) =>
          hasProtectedSceneAccess(request, id, currentNavigation)
        )
        const parsedNextNavigation = storedNavigationConfigSchema.parse(nextNavigation)
        const unauthorizedScene = findUnauthorizedProtectedScene(
          request,
          currentNavigation,
          parsedNextNavigation
        )
        if (unauthorizedScene) {
          throw new BookmarkManagementError(
            403,
            'PROTECTED_SCENE_LOCKED',
            `请先解锁场景“${unauthorizedScene.name}”`
          )
        }
        return { navigation: parsedNextNavigation, result: null }
      })
      reply.header('ETag', navigationEtag(savedNavigation))
      return sanitizeNavigationConfig(savedNavigation, (id) =>
        hasProtectedSceneAccess(request, id, savedNavigation)
      )
    } catch (error) {
      if (error instanceof NavigationRevisionMismatchError) {
        return reply.code(412).send(error.message)
      }
      if (error instanceof BookmarkManagementError && error.statusCode === 403) {
        return reply.code(403).send(error.message)
      }
      const message = error instanceof Error ? error.message : '保存导航配置失败'
      reply.code(400)
      return message
    }
  })

  app.put('/api/config/navigation/scenes/:sceneId/password', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    const expectedRevision = getIfMatchRevision(request)
    if (!expectedRevision) {
      return reply.code(428).send('配置已启用并发保护，请重新加载后再保存')
    }
    const { sceneId } = sceneIdParamsSchema.parse(request.params)
    const { password } = scenePasswordBodySchema.parse(request.body)
    const passwordHash = password ? await hashPassword(password) : undefined
    const sessionKey = authService.getSessionKey(request)
    let savedNavigation: NavigationConfig
    try {
      savedNavigation = await commitScenePasswordConfig(
        sceneId,
        passwordHash,
        (current) => {
          if (
            !sessionKey ||
            !authService.isSessionCurrent(request, current.system.auth, sessionKey)
          ) {
            throw new BookmarkManagementError(401, 'SESSION_EXPIRED', '请先登录')
          }
          const navigation = current.navigation
          if (getNavigationRevision(navigation) !== expectedRevision) {
            throw new NavigationRevisionMismatchError('导航状态已变化，请重新加载后再保存')
          }
          const currentScene = navigation.scenes.find((scene) => scene.id === sceneId)
          if (!currentScene) throw new BookmarkManagementError(404, 'SCENE_NOT_FOUND', '场景不存在')
          if (
            currentScene.protected &&
            !hasProtectedSceneAccess(request, currentScene.id, navigation)
          ) {
            throw new BookmarkManagementError(
              403,
              'PROTECTED_SCENE_LOCKED',
              `请先解锁场景“${currentScene.name}”`
            )
          }
        },
        () => sceneAccessService.clear()
      )
    } catch (error) {
      if (error instanceof NavigationRevisionMismatchError)
        return reply.code(412).send(error.message)
      if (error instanceof BookmarkManagementError)
        return reply.code(error.statusCode).send(error.message)
      throw error
    }
    reply.header('ETag', navigationEtag(savedNavigation))
    return sanitizeNavigationConfig(savedNavigation, (id) =>
      hasProtectedSceneAccess(request, id, savedNavigation)
    )
  })

  app.get('/api/navigation/scenes', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    const navigation = await readNavigationConfig()
    return {
      defaultSceneId: navigation.defaultSceneId,
      scenes: navigation.scenes.map((scene) => ({
        id: scene.id,
        name: scene.name,
        protected: scene.protected,
      })),
    }
  })

  app.get('/api/navigation', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    const navigation = await readNavigationConfig()
    const query = sceneNavigationQuerySchema.parse(request.query)
    const sceneId = query.sceneId ?? navigation.defaultSceneId
    const scene = navigation.scenes.find((item) => item.id === sceneId)
    if (!scene) {
      return reply.code(404).send('场景不存在')
    }

    if (scene.protected) {
      const sessionKey = authService.getSessionKey(request)
      const sceneToken = request.headers['x-scene-token']
      const token = typeof sceneToken === 'string' ? sceneToken : undefined
      if (
        !sessionKey ||
        !sceneAccessService.validate(token, sessionKey, scene.id, scene.passwordHash)
      ) {
        return reply.code(403).send('场景需要解锁')
      }
    }

    return resolveSceneServices(navigation, scene.id)
  })

  app.post('/api/navigation/scenes/:sceneId/unlock', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    const { sceneId } = sceneIdParamsSchema.parse(request.params)
    const { password } = sceneUnlockBodySchema.parse(request.body)
    const initial = await inspectAppConfig((current) => {
      const sessionKey = authService.getSessionKey(request)
      if (!sessionKey || !authService.isSessionCurrent(request, current.system.auth, sessionKey)) {
        return { error: '请先登录', status: 401 } as const
      }
      const scene = current.navigation.scenes.find((item) => item.id === sceneId)
      if (!scene) return { error: '场景不存在', status: 404 } as const
      return { scene, sessionKey, access: sceneAccessService.capture(sessionKey, sceneId) }
    })
    if (initial.status !== undefined) return reply.code(initial.status).send(initial.error)
    const { scene, sessionKey, access } = initial
    if (!scene.protected || !scene.passwordHash) return { token: null, expiresAt: null }
    const attempt = sceneAccessService.beginAttempt(sceneId, request.ip)
    if (!attempt.finish) {
      reply.header('Retry-After', String(attempt.retryAfter))
      return reply.code(429).send('尝试过于频繁，请稍后再试')
    }
    let outcome: PasswordAttemptResult = 'cancelled'
    try {
      if (!(await verifyPassword(password, scene.passwordHash))) {
        outcome = 'failure'
        return reply.code(401).send('场景密码错误')
      }
      const result = await inspectAppConfig((current) => {
        if (!authService.isSessionCurrent(request, current.system.auth, sessionKey)) {
          return { error: '请先登录', status: 401 } as const
        }
        const latest = current.navigation.scenes.find((item) => item.id === sceneId)
        if (!latest?.protected || latest.passwordHash !== scene.passwordHash) {
          return { error: '场景状态已变化，请重新解锁', status: 409 } as const
        }
        const issued = sceneAccessService.issue(access, scene.passwordHash!)
        return issued ?? ({ error: '场景已重新锁定，请重新解锁', status: 409 } as const)
      })
      if ('error' in result) return reply.code(result.status).send(result.error)
      outcome = 'success'
      return result
    } finally {
      attempt.finish(outcome)
    }
  })

  app.post('/api/navigation/scenes/:sceneId/lock', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) return reply
    const { sceneId } = sceneIdParamsSchema.parse(request.params)
    const status = await inspectAppConfig((current) => {
      const sessionKey = authService.getSessionKey(request)
      if (!sessionKey || !authService.isSessionCurrent(request, current.system.auth, sessionKey))
        return 401
      if (!current.navigation.scenes.some((scene) => scene.id === sceneId)) return 404
      sceneAccessService.lock(sessionKey, sceneId)
      return 200
    })
    if (status !== 200) return reply.code(status).send(status === 401 ? '请先登录' : '场景不存在')
    return { ok: true }
  })

  app.get('/api/config/system', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    const system = await readSystemConfig()
    reply.header('ETag', `"${systemRevision(system)}"`)
    return sanitizeSystemConfig(system)
  })

  app.put('/api/config/system', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    try {
      const expectedRevision = getIfMatchRevision(request)
      if (!expectedRevision) return reply.code(428).send('请重新加载配置后再保存')
      const { appConfig: saved } = await mutateAppConfig((current) => {
        if (systemRevision(current.system) !== expectedRevision) {
          throw new NavigationRevisionMismatchError('系统设置已变化，请重新加载后再保存')
        }
        return {
          appConfig: { ...current, system: mergeSystemAuth(request.body, current.system.auth) },
          result: null,
        }
      })
      void webdavBackupManager.reloadSchedule().catch((error) => app.log.error(error))
      reply.header('ETag', `"${systemRevision(saved.system)}"`)
      return sanitizeSystemConfig(saved.system)
    } catch (error) {
      if (error instanceof NavigationRevisionMismatchError)
        return reply.code(412).send(error.message)
      const message = error instanceof Error ? error.message : '保存系统配置失败'
      reply.code(400)
      return message
    }
  })

  app.get('/api/backups/webdav/versions', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    try {
      return await webdavBackupManager.listVersions()
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取 WebDAV 备份版本失败'
      reply.code(400)
      return message
    }
  })

  app.post('/api/backups/webdav/run', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    try {
      return await webdavBackupManager.runBackup('manual')
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行 WebDAV 备份失败'
      reply.code(400)
      return message
    }
  })

  app.post('/api/backups/webdav/restore', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    try {
      const { versionId } = restoreWebdavBackupBodySchema.parse(request.body)
      const result = await webdavBackupManager.restoreVersion(versionId)

      if (result.requiresReauth) {
        authService.clearSessionCookie(reply, request)
      }

      return {
        requiresReauth: result.requiresReauth,
        restoredConfig: sanitizeAppConfig(result.restoredConfig, () => false),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '恢复 WebDAV 备份版本失败'
      reply.code(400)
      return message
    }
  })

  if (isProduction) {
    await app.register(fastifyStatic, {
      root: clientDistDir,
      prefix: '/',
    })

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ message: 'Not Found' })
      }

      return reply.sendFile('index.html')
    })
  }

  return app
}
