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
  type NavigationConfig,
  type NavigationSceneConfig,
} from '../src/config/schema.js'
import {
  readAppConfig,
  readNavigationConfig,
  readSystemConfig,
  mutateNavigationConfig,
  writeAppConfig,
  writeNavigationConfig,
  writeSystemConfig,
} from './configStore.js'
import { createAuthService } from './auth.js'
import { createWebdavBackupManager } from './webdavBackupManager.js'
import { createSceneAccessService } from './sceneAccess.js'
import { hashPassword, verifyPassword } from './password.js'
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

function sanitizeSystemConfig(system: Awaited<ReturnType<typeof readSystemConfig>>) {
  const sanitized = { ...system }
  delete sanitized.auth
  return sanitized
}

function sanitizeAppConfig(config: Awaited<ReturnType<typeof readAppConfig>>) {
  return {
    ...config,
    system: sanitizeSystemConfig(config.system),
    navigation: sanitizeNavigationConfig(config.navigation),
  }
}

function sanitizeNavigationConfig(navigation: Awaited<ReturnType<typeof readNavigationConfig>>) {
  return {
    ...navigation,
    scenes: navigation.scenes.map((scene) => {
      const sanitizedScene = { ...scene }
      delete sanitizedScene.passwordHash
      return sanitizedScene
    }),
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
  currentNavigation: Awaited<ReturnType<typeof readNavigationConfig>>
) {
  if (!isRecord(navigationPayload)) {
    return navigationPayload
  }

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
  currentConfig: Awaited<ReturnType<typeof readAppConfig>>
) {
  const withAuth = mergeAppAuth(appPayload, currentConfig.system.auth)
  if (!isRecord(withAuth)) {
    return withAuth
  }
  return {
    ...withAuth,
    navigation: mergeNavigationPasswords(withAuth.navigation, currentConfig.navigation),
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

function getConnectionAddress(request: FastifyRequest) {
  return request.socket.remoteAddress ?? 'unknown'
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
const integrationSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  sceneId: z.string().trim().min(1).optional(),
})

function isIntegrationRequestAuthorized(request: FastifyRequest) {
  return isIntegrationTokenValid(readIntegrationTokenHeader(request.headers))
}

export async function buildServer() {
  const contentSecurityPolicy = await buildContentSecurityPolicy()
  const app = Fastify({ logger: true, trustProxy: getTrustProxySetting() })
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

  function hasProtectedSceneAccess(request: FastifyRequest, sceneId: string) {
    const sessionKey = authService.getSessionKey(request)
    return Boolean(
      sessionKey &&
      sceneAccessService.validate(getSuppliedSceneToken(request, sceneId), sessionKey, sceneId)
    )
  }

  function findUnauthorizedProtectedScene(
    request: FastifyRequest,
    currentNavigation: NavigationConfig,
    nextNavigation: NavigationConfig
  ) {
    return currentNavigation.scenes.find(
      (scene) =>
        scene.protected &&
        protectedSceneChanged(currentNavigation, nextNavigation, scene) &&
        !hasProtectedSceneAccess(request, scene.id)
    )
  }

  const webdavBackupManager = createWebdavBackupManager({
    readAppConfig,
    readSystemConfig,
    writeAppConfig,
    logger: app.log,
  })

  await webdavBackupManager.reloadSchedule()

  app.addHook('onSend', async (request, reply, payload) => {
    applySecurityHeaders(request, reply, contentSecurityPolicy)
    return payload
  })

  app.addHook('onClose', async () => {
    webdavBackupManager.stop()
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

  app.get('/api/config/app', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    return sanitizeAppConfig(await readAppConfig())
  })

  app.put('/api/config/app', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    try {
      const currentConfig = await readAppConfig()
      const nextConfig = mergeAppSecrets(request.body, currentConfig)
      const parsedNextConfig = appConfigSchema.parse(nextConfig)
      const nextNavigation = storedNavigationConfigSchema.parse(parsedNextConfig.navigation)
      const unauthorizedScene = findUnauthorizedProtectedScene(
        request,
        currentConfig.navigation,
        nextNavigation
      )
      if (unauthorizedScene) {
        return reply.code(403).send(`请先解锁场景“${unauthorizedScene.name}”`)
      }
      const savedConfig = await writeAppConfig({
        ...parsedNextConfig,
        navigation: nextNavigation,
      })
      await webdavBackupManager.reloadSchedule()
      return sanitizeAppConfig(savedConfig)
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存整站配置失败'
      reply.code(400)
      return message
    }
  })

  app.get('/api/config/navigation', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    return sanitizeNavigationConfig(await readNavigationConfig())
  })

  app.put('/api/config/navigation', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    try {
      const currentNavigation = await readNavigationConfig()
      const nextNavigation = mergeNavigationPasswords(request.body, currentNavigation)
      const parsedNextNavigation = storedNavigationConfigSchema.parse(nextNavigation)
      const unauthorizedScene = findUnauthorizedProtectedScene(
        request,
        currentNavigation,
        parsedNextNavigation
      )
      if (unauthorizedScene) {
        return reply.code(403).send(`请先解锁场景“${unauthorizedScene.name}”`)
      }
      const savedNavigation = await writeNavigationConfig(parsedNextNavigation)
      return sanitizeNavigationConfig(savedNavigation)
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存导航配置失败'
      reply.code(400)
      return message
    }
  })

  app.put('/api/config/navigation/scenes/:sceneId/password', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    const { sceneId } = sceneIdParamsSchema.parse(request.params)
    const { password } = scenePasswordBodySchema.parse(request.body)
    const navigation = await readNavigationConfig()
    const sceneIndex = navigation.scenes.findIndex((scene) => scene.id === sceneId)
    if (sceneIndex < 0) {
      return reply.code(404).send('场景不存在')
    }
    const currentScene = navigation.scenes[sceneIndex]
    if (currentScene.protected && !hasProtectedSceneAccess(request, currentScene.id)) {
      return reply.code(403).send(`请先解锁场景“${currentScene.name}”`)
    }

    const passwordHash = password ? await hashPassword(password) : undefined
    const scenes = navigation.scenes.map((scene, index) =>
      index === sceneIndex
        ? {
            ...scene,
            protected: Boolean(password),
            passwordHash,
          }
        : scene
    )
    const savedNavigation = await writeNavigationConfig({ ...navigation, scenes })
    sceneAccessService.clear()
    return sanitizeNavigationConfig(savedNavigation)
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
      if (!sessionKey || !sceneAccessService.validate(token, sessionKey, scene.id)) {
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
    const navigation = await readNavigationConfig()
    const scene = navigation.scenes.find((item) => item.id === sceneId)
    if (!scene) {
      return reply.code(404).send('场景不存在')
    }
    if (!scene.protected || !scene.passwordHash) {
      return { token: null, expiresAt: null }
    }

    const sessionKey = authService.getSessionKey(request)
    if (!sessionKey) {
      return reply.code(401).send('请先登录')
    }
    const connectionAddress = getConnectionAddress(request)
    if (!sceneAccessService.ensureCanAttempt(sessionKey, sceneId, connectionAddress)) {
      return reply.code(429).send('尝试过于频繁，请稍后再试')
    }
    if (!(await verifyPassword(password, scene.passwordHash))) {
      sceneAccessService.registerFailure(sessionKey, sceneId, connectionAddress)
      return reply.code(401).send('场景密码错误')
    }

    sceneAccessService.clearFailures(sessionKey, sceneId, connectionAddress)
    return sceneAccessService.issue(sessionKey, sceneId)
  })

  app.post('/api/navigation/scenes/:sceneId/lock', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }
    sceneIdParamsSchema.parse(request.params)
    const sceneToken = request.headers['x-scene-token']
    sceneAccessService.lock(typeof sceneToken === 'string' ? sceneToken : undefined)
    return { ok: true }
  })

  app.get('/api/config/system', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    return sanitizeSystemConfig(await readSystemConfig())
  })

  app.put('/api/config/system', async (request, reply) => {
    if (!(await authService.requireAuthenticated(request, reply))) {
      return reply
    }

    try {
      const currentSystem = await readSystemConfig()
      const nextSystem = mergeSystemAuth(request.body, currentSystem.auth)
      const savedSystem = await writeSystemConfig(nextSystem)
      await webdavBackupManager.reloadSchedule()
      return sanitizeSystemConfig(savedSystem)
    } catch (error) {
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
        authService.invalidateAllSessions(reply, request)
      }
      sceneAccessService.clear()

      return {
        requiresReauth: result.requiresReauth,
        restoredConfig: sanitizeAppConfig(result.restoredConfig),
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
