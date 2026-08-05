// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig, SystemConfig } from '../src/config/schema.js'

let tempConfigDir = ''
let app: Awaited<ReturnType<(typeof import('./app.js'))['buildServer']>> | null = null

async function buildTestServer() {
  vi.resetModules()
  process.env.CONFIG_DIR = tempConfigDir
  process.env.NODE_ENV = 'test'
  const { buildServer } = await import('./app.js')
  app = await buildServer()
  return app
}

async function readStoredConfig() {
  const text = await readFile(path.join(tempConfigDir, 'config.json'), 'utf8')
  return JSON.parse(text) as AppConfig
}

function getSessionCookie(response: {
  headers: {
    'set-cookie'?: string | string[]
  }
}) {
  const header = response.headers['set-cookie']
  const value = Array.isArray(header) ? header[0] : header

  expect(value).toBeTruthy()
  return value!.split(';')[0]
}

async function setupAdmin(server: NonNullable<typeof app>, username = 'admin-user') {
  const password = 'strong-password-123'
  const response = await server.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: {
      username,
      password,
    },
  })

  expect(response.statusCode).toBe(200)

  return {
    username,
    password,
    cookie: getSessionCookie(response),
  }
}

describe('auth module', () => {
  beforeEach(async () => {
    tempConfigDir = await mkdtemp(path.join(os.tmpdir(), 'harbordeck-auth-'))
  })

  afterEach(async () => {
    delete process.env.CONFIG_DIR
    delete process.env.NODE_ENV
    delete process.env.HARBORDECK_SEARCH_TOKEN
    delete process.env.HARBORDECK_TRUST_PROXY

    if (app) {
      await app.close()
      app = null
    }

    if (tempConfigDir) {
      await rm(tempConfigDir, { recursive: true, force: true })
      tempConfigDir = ''
    }
  })

  it('requires setup before access and stores only a password hash', async () => {
    const server = await buildTestServer()

    const statusResponse = await server.inject({
      method: 'GET',
      url: '/api/auth/status',
    })

    expect(statusResponse.statusCode).toBe(200)
    expect(statusResponse.json()).toEqual({
      setupRequired: true,
      authenticated: false,
    })

    const blockedResponse = await server.inject({
      method: 'GET',
      url: '/api/config/system',
    })

    expect(blockedResponse.statusCode).toBe(428)
    expect(blockedResponse.body).toContain('请先创建管理员账号')

    const { cookie } = await setupAdmin(server)
    const storedConfig = await readStoredConfig()

    expect(storedConfig.system.auth?.username).toBe('admin-user')
    expect(storedConfig.system.auth?.passwordHash).toMatch(/^scrypt\$/)
    expect(storedConfig.system.auth?.passwordHash).not.toBe('strong-password-123')

    const publicSystemResponse = await server.inject({
      method: 'GET',
      url: '/api/config/system',
      headers: { cookie },
    })
    const publicAppResponse = await server.inject({
      method: 'GET',
      url: '/api/config/app',
      headers: { cookie },
    })

    expect(publicSystemResponse.statusCode).toBe(200)
    expect((publicSystemResponse.json() as SystemConfig & { auth?: unknown }).auth).toBeUndefined()
    expect(publicAppResponse.statusCode).toBe(200)
    expect((publicAppResponse.json() as AppConfig).system.auth).toBeUndefined()

    const healthResponse = await server.inject({
      method: 'GET',
      url: '/api/health',
    })

    expect(healthResponse.statusCode).toBe(200)
    expect(healthResponse.json()).toEqual({ ok: true })
  })

  it('sets hardened response headers and trusts forwarded HTTPS only when configured', async () => {
    const server = await buildTestServer()
    const spoofedHttpsResponse = await server.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-forwarded-proto': 'https' },
    })

    expect(spoofedHttpsResponse.headers['cache-control']).toBe('no-store')
    expect(spoofedHttpsResponse.headers.pragma).toBe('no-cache')
    expect(spoofedHttpsResponse.headers['content-security-policy']).toContain("default-src 'self'")
    expect(spoofedHttpsResponse.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'"
    )
    expect(spoofedHttpsResponse.headers['x-frame-options']).toBe('DENY')
    expect(spoofedHttpsResponse.headers['permissions-policy']).toBe(
      'camera=(), microphone=(), geolocation=()'
    )
    expect(spoofedHttpsResponse.headers['strict-transport-security']).toBeUndefined()

    await server.close()
    app = null
    process.env.HARBORDECK_TRUST_PROXY = 'loopback'
    const trustedProxyServer = await buildTestServer()
    const trustedHttpsResponse = await trustedProxyServer.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-forwarded-proto': 'https' },
    })

    expect(trustedHttpsResponse.headers['strict-transport-security']).toBe('max-age=31536000')
  })

  it('does not expose navigation data from integration writes', async () => {
    process.env.HARBORDECK_SEARCH_TOKEN = 'integration-test-token'
    const server = await buildTestServer()
    const response = await server.inject({
      method: 'POST',
      url: '/api/integrations/bookmarks',
      headers: { 'x-harbordeck-search-token': 'integration-test-token' },
      payload: {
        name: 'Security test',
        primaryUrl: 'https://security.example.com',
        placements: [],
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).not.toHaveProperty('navigation')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers.vary).toBe('X-HarborDeck-Search-Token')

    const rejectedResponse = await server.inject({
      method: 'POST',
      url: '/api/integrations/bookmarks',
      headers: { 'x-harbordeck-search-token': 'integration-test-token' },
      payload: {
        name: 'Unsafe test',
        primaryUrl: 'javascript:alert(1)',
        placements: [],
      },
    })
    expect(rejectedResponse.statusCode).toBe(400)
  })

  it('preserves stored auth when saving sanitized config payloads', async () => {
    const server = await buildTestServer()
    const { cookie } = await setupAdmin(server)
    const originalConfig = await readStoredConfig()

    const appResponse = await server.inject({
      method: 'GET',
      url: '/api/config/app',
      headers: { cookie },
    })
    const publicApp = appResponse.json() as AppConfig

    const saveAppResponse = await server.inject({
      method: 'PUT',
      url: '/api/config/app',
      headers: { cookie },
      payload: {
        ...publicApp,
        system: {
          ...publicApp.system,
          appName: 'Secured Harbor',
        },
      },
    })

    expect(saveAppResponse.statusCode).toBe(200)
    expect((saveAppResponse.json() as AppConfig).system.auth).toBeUndefined()

    const systemResponse = await server.inject({
      method: 'GET',
      url: '/api/config/system',
      headers: { cookie },
    })
    const publicSystem = systemResponse.json() as SystemConfig

    const saveSystemResponse = await server.inject({
      method: 'PUT',
      url: '/api/config/system',
      headers: { cookie },
      payload: {
        ...publicSystem,
        darkMode: !publicSystem.darkMode,
      },
    })

    expect(saveSystemResponse.statusCode).toBe(200)
    expect((saveSystemResponse.json() as SystemConfig & { auth?: unknown }).auth).toBeUndefined()

    const storedConfig = await readStoredConfig()
    expect(storedConfig.system.auth).toEqual(originalConfig.system.auth)
    expect(storedConfig.system.appName).toBe('Secured Harbor')
    expect(storedConfig.system.darkMode).toBe(!publicSystem.darkMode)
  })

  it('stores scene passwords privately and requires an unlock token for protected navigation', async () => {
    const server = await buildTestServer()
    const { cookie } = await setupAdmin(server)
    const navigationResponse = await server.inject({
      method: 'GET',
      url: '/api/config/navigation',
      headers: { cookie },
    })
    const navigation = navigationResponse.json() as AppConfig['navigation']

    const saveResponse = await server.inject({
      method: 'PUT',
      url: '/api/config/navigation',
      headers: { cookie },
      payload: {
        ...navigation,
        scenes: [
          ...navigation.scenes,
          {
            id: 'work',
            name: 'Work',
            protected: false,
            groups: [],
          },
        ],
      },
    })
    expect(saveResponse.statusCode).toBe(200)

    const passwordResponse = await server.inject({
      method: 'PUT',
      url: '/api/config/navigation/scenes/work/password',
      headers: { cookie },
      payload: { password: 'work-secret' },
    })
    expect(passwordResponse.statusCode).toBe(200)
    const publicNavigation = passwordResponse.json() as AppConfig['navigation']
    const publicScene = publicNavigation.scenes.find((scene) => scene.id === 'work')
    expect(publicScene?.protected).toBe(true)
    expect(publicScene?.passwordHash).toBeUndefined()

    const storedScene = (await readStoredConfig()).navigation.scenes.find(
      (scene) => scene.id === 'work'
    )
    expect(storedScene?.passwordHash).toMatch(/^scrypt\$/)
    expect(storedScene?.passwordHash).not.toBe('work-secret')

    const protectedConfig = publicNavigation
    const unauthorizedConfigSave = await server.inject({
      method: 'PUT',
      url: '/api/config/navigation',
      headers: { cookie },
      payload: {
        ...protectedConfig,
        scenes: protectedConfig.scenes.map((scene) =>
          scene.id === 'work' ? { ...scene, name: 'Changed without unlock' } : scene
        ),
      },
    })
    expect(unauthorizedConfigSave.statusCode).toBe(403)

    const unauthorizedPasswordChange = await server.inject({
      method: 'PUT',
      url: '/api/config/navigation/scenes/work/password',
      headers: { cookie },
      payload: { password: null },
    })
    expect(unauthorizedPasswordChange.statusCode).toBe(403)

    const blockedNavigation = await server.inject({
      method: 'GET',
      url: '/api/navigation?sceneId=work',
      headers: { cookie },
    })
    expect(blockedNavigation.statusCode).toBe(403)

    const wrongUnlock = await server.inject({
      method: 'POST',
      url: '/api/navigation/scenes/work/unlock',
      headers: { cookie },
      payload: { password: 'wrong-secret' },
    })
    expect(wrongUnlock.statusCode).toBe(401)

    const unlockResponse = await server.inject({
      method: 'POST',
      url: '/api/navigation/scenes/work/unlock',
      headers: { cookie },
      payload: { password: 'work-secret' },
    })
    expect(unlockResponse.statusCode).toBe(200)
    const { token } = unlockResponse.json() as { token: string }

    const publicConfigResponse = await server.inject({
      method: 'GET',
      url: '/api/config/navigation',
      headers: { cookie },
    })
    const publicConfig = publicConfigResponse.json() as AppConfig['navigation']
    const saveAfterUnlockResponse = await server.inject({
      method: 'PUT',
      url: '/api/config/navigation',
      headers: { cookie, 'x-scene-tokens': JSON.stringify({ work: token }) },
      payload: {
        ...publicConfig,
        scenes: publicConfig.scenes.map((scene) =>
          scene.id === 'work' ? { ...scene, name: 'Work updated' } : scene
        ),
      },
    })
    expect(saveAfterUnlockResponse.statusCode).toBe(200)

    const unlockedNavigation = await server.inject({
      method: 'GET',
      url: '/api/navigation?sceneId=work',
      headers: { cookie, 'x-scene-token': token },
    })
    expect(unlockedNavigation.statusCode).toBe(200)
    expect(unlockedNavigation.json()).toEqual([])
  })

  it('rejects invalid logins, rate limits repeated failures, and rotates sessions on credential updates', async () => {
    const server = await buildTestServer()
    const { password } = await setupAdmin(server)

    const wrongLoginResponse = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-forwarded-for': '198.51.100.1' },
      payload: {
        username: 'attacker-one',
        password: 'wrong-password-999',
      },
    })

    expect(wrongLoginResponse.statusCode).toBe(401)

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-forwarded-for': `198.51.100.${attempt + 2}` },
        payload: {
          username: `attacker-${attempt + 2}`,
          password: 'wrong-password-999',
        },
      })

      expect(response.statusCode).toBe(401)
    }

    const limitedResponse = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-forwarded-for': '203.0.113.200' },
      payload: {
        username: 'admin-user',
        password: 'wrong-password-999',
      },
    })

    expect(limitedResponse.statusCode).toBe(429)

    await server.close()
    app = null

    const freshServer = await buildTestServer()
    const validLoginResponse = await freshServer.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'admin-user',
        password,
      },
    })

    expect(validLoginResponse.statusCode).toBe(200)
    const oldCookie = getSessionCookie(validLoginResponse)

    const updateResponse = await freshServer.inject({
      method: 'PUT',
      url: '/api/auth/credentials',
      headers: { cookie: oldCookie },
      payload: {
        currentPassword: password,
        nextUsername: 'harbor-admin',
        nextPassword: 'new-strong-password-456',
      },
    })

    expect(updateResponse.statusCode).toBe(200)
    const newCookie = getSessionCookie(updateResponse)

    const oldSessionResponse = await freshServer.inject({
      method: 'GET',
      url: '/api/config/system',
      headers: { cookie: oldCookie },
    })
    const newSessionResponse = await freshServer.inject({
      method: 'GET',
      url: '/api/config/system',
      headers: { cookie: newCookie },
    })

    expect(oldSessionResponse.statusCode).toBe(401)
    expect(newSessionResponse.statusCode).toBe(200)

    const oldCredentialsResponse = await freshServer.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'admin-user',
        password,
      },
    })
    const newCredentialsResponse = await freshServer.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'harbor-admin',
        password: 'new-strong-password-456',
      },
    })

    expect(oldCredentialsResponse.statusCode).toBe(401)
    expect(newCredentialsResponse.statusCode).toBe(200)
  })
})
