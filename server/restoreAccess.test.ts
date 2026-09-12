// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '../src/config/schema.js'

const versionId = 'harbor-deck-config-20260912T120000000Z.json'
const username = 'restore-admin'
const password = 'restore-original-password'
const restoredPassword = 'restore-replacement-password'
let directory: string
let server: FastifyInstance
let store: typeof import('./configStore.js')
let initial: AppConfig
let cookie: string
let sceneToken: string

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function stalledBody(prefix: string, onCancel: () => void) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(prefix))
    },
    cancel: onCancel,
  })
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'harbordeck-restore-access-'))
  vi.stubEnv('CONFIG_DIR', directory)
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('HARBORDECK_WEBDAV_TIMEOUT_MS', '15000')
  vi.resetModules()
  store = await import('./configStore.js')
  const { hashPassword } = await import('./password.js')
  const { buildServer } = await import('./app.js')
  server = await buildServer()
  server.log.level = 'silent'
  const setup = await server.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: { username, password },
  })
  expect(setup.statusCode).toBe(200)
  cookie = String(setup.headers['set-cookie']).split(';')[0]
  const configured = await store.readAppConfig()
  initial = await store.writeAppConfig({
    ...configured,
    system: {
      ...configured.system,
      webdavBackup: {
        ...configured.system.webdavBackup,
        url: 'https://fixture.invalid/dav/',
        username: 'fixture-user',
        password: 'fixture-password',
        autoBackup: false,
      },
    },
    navigation: {
      defaultSceneId: 'private',
      bookmarks: [
        {
          slug: 'private-link',
          name: 'Original private',
          primaryUrl: 'https://fixture.invalid/private',
          note: 'ORIGINAL-PRIVATE',
        },
      ],
      scenes: [
        {
          id: 'private',
          name: 'Private',
          protected: true,
          passwordHash: await hashPassword('scene-password'),
          groups: [{ id: 'main', name: 'Main', bookmarkIds: ['private-link'] }],
        },
      ],
    },
  })
  const unlocked = await server.inject({
    method: 'POST',
    url: '/api/navigation/scenes/private/unlock',
    headers: { cookie },
    payload: { password: 'scene-password' },
  })
  expect(unlocked.statusCode).toBe(200)
  sceneToken = unlocked.json().token
})

afterEach(async () => {
  await server?.close()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})

describe('restore access at the actual app commit boundary', () => {
  it.each([false, true])(
    'revokes scene access immediately while scheduling stalls (auth changed: %s)',
    async (changeAuth) => {
      const { hashPassword } = await import('./password.js')
      const restored = structuredClone(initial)
      restored.system.appName = 'Restored fixture'
      restored.system.webdavBackup.autoBackup = true
      if (changeAuth)
        restored.system.auth = { username, passwordHash: await hashPassword(restoredPassword) }
      // Intentionally retain the exact scene password hash: restoring must still clear access.
      restored.navigation.bookmarks[0].note = 'RESTORED-PRIVATE-MARKER'
      const schedulingStarted = deferred()
      let schedulingCancelled = false
      const fetchFixture = vi.fn<typeof fetch>(async (_input, init) => {
        if (init?.method === 'GET') return new Response(JSON.stringify(restored), { status: 200 })
        if (init?.method === 'MKCOL') return new Response(null, { status: 405 })
        if (init?.method === 'PROPFIND') {
          schedulingStarted.resolve()
          return new Response(
            stalledBody('<d:multistatus xmlns:d="DAV:">', () => {
              schedulingCancelled = true
            }),
            { status: 207 }
          )
        }
        throw new Error(`Unexpected fixture request: ${init?.method}`)
      })
      vi.stubGlobal('fetch', fetchFixture)
      const response = await server.inject({
        method: 'POST',
        url: '/api/backups/webdav/restore',
        headers: { cookie },
        payload: { versionId },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().requiresReauth).toBe(changeAuth)
      expect(response.body).not.toContain('RESTORED-PRIVATE-MARKER')
      await schedulingStarted.promise
      expect(schedulingCancelled).toBe(false)
      expect((await store.readAppConfig()).system.appName).toBe('Restored fixture')
      const status = await server.inject({
        method: 'GET',
        url: '/api/auth/status',
        headers: { cookie },
      })
      expect(status.json().authenticated).toBe(!changeAuth)
      const privateResponse = await server.inject({
        method: 'GET',
        url: '/api/navigation?sceneId=private',
        headers: { cookie, 'x-scene-token': sceneToken },
      })
      expect(privateResponse.statusCode).toBe(changeAuth ? 401 : 403)
      expect(privateResponse.body).not.toContain('RESTORED-PRIVATE-MARKER')
      const login = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username, password: changeAuth ? restoredPassword : password },
      })
      expect(login.statusCode).toBe(200)
      const newCookie = String(login.headers['set-cookie']).split(';')[0]
      expect(
        (
          await server.inject({
            method: 'GET',
            url: '/api/navigation?sceneId=private',
            headers: { cookie: newCookie, 'x-scene-token': sceneToken },
          })
        ).statusCode
      ).toBe(403)
      await server.close()
      expect(schedulingCancelled).toBe(true)
    }
  )

  it('cancels a downloading restore in preClose without committing configuration', async () => {
    const originalFile = await readFile(path.join(directory, 'config.json'), 'utf8')
    const downloading = deferred()
    let downloadCancelled = false
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (_input, init) => {
        expect(init?.method).toBe('GET')
        downloading.resolve()
        return new Response(
          stalledBody('{"system":', () => {
            downloadCancelled = true
          }),
          { status: 200 }
        )
      })
    )
    const pending = server
      .inject({
        method: 'POST',
        url: '/api/backups/webdav/restore',
        headers: { cookie },
        payload: { versionId },
      })
      .then((response) => response)
    await downloading.promise
    await server.close()
    const result = await pending
    expect(result.statusCode).toBe(400)
    expect(result.body).toContain('取消')
    expect(downloadCancelled).toBe(true)
    expect(await readFile(path.join(directory, 'config.json'), 'utf8')).toBe(originalFile)
  })
})
