// @vitest-environment node
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const control = vi.hoisted(() => ({
  hash: null as null | ((password: string) => Promise<void>),
  verify: null as null | ((password: string) => Promise<void>),
}))
vi.mock('./password.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./password.js')>()
  return {
    ...actual,
    async hashPassword(password: string) {
      await control.hash?.(password)
      return actual.hashPassword(password)
    },
    async verifyPassword(password: string, hash: string) {
      await control.verify?.(password)
      return actual.verifyPassword(password, hash)
    },
  }
})

let directory: string
let server: FastifyInstance
let store: typeof import('./configStore.js')
const releases: Array<() => void> = []
const username = 'review-admin'
const password = 'review-original-password'
const nextPassword = 'review-next-password'
const cookieOf = (response: { headers: Record<string, unknown> }) =>
  String(response.headers['set-cookie']).split(';')[0]

function hold(kind: 'hash' | 'verify', target: string, count = 1) {
  let arrived = 0
  let started!: () => void
  let release!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  releases.push(release)
  control[kind] = async (candidate) => {
    if (candidate !== target || arrived >= count) return
    arrived += 1
    if (arrived === count) started()
    await wait
  }
  return { ready, release }
}

async function setup() {
  const response = await server.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: { username, password },
  })
  expect(response.statusCode).toBe(200)
  return cookieOf(response)
}

function changeCredentials(cookie: string, replacement = nextPassword) {
  return server
    .inject({
      method: 'PUT',
      url: '/api/auth/credentials',
      headers: { cookie },
      payload: { currentPassword: password, nextUsername: username, nextPassword: replacement },
    })
    .then((response) => response)
}

async function status(cookie: string) {
  return (
    await server.inject({ method: 'GET', url: '/api/auth/status', headers: { cookie } })
  ).json()
}

async function createPrivateScenes() {
  const { hashPassword } = await import('./password.js')
  const passwordHash = await hashPassword('scene-password')
  await store.writeAppConfig({
    ...(await store.readAppConfig()),
    navigation: {
      defaultSceneId: 'first',
      bookmarks: [],
      scenes: ['first', 'second'].map((id) => ({
        id,
        name: id,
        protected: true,
        passwordHash,
        groups: [],
      })),
    },
  })
}

beforeEach(async () => {
  control.hash = null
  control.verify = null
  directory = await mkdtemp(path.join(os.tmpdir(), 'harbordeck-auth-races-'))
  vi.stubEnv('CONFIG_DIR', directory)
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('HARBORDECK_TRUST_PROXY', '10.0.0.5')
  vi.resetModules()
  store = await import('./configStore.js')
  const { buildServer } = await import('./app.js')
  server = await buildServer()
  server.log.level = 'silent'
})

afterEach(async () => {
  releases.splice(0).forEach((release) => release())
  await server?.close()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})

describe('authentication transaction races', () => {
  it('commits one concurrent setup and never grants the losing request a session', async () => {
    const barrier = hold('hash', password, 2)
    const requests = [0, 1].map(() =>
      server
        .inject({ method: 'POST', url: '/api/auth/setup', payload: { username, password } })
        .then((response) => response)
    )
    await barrier.ready
    barrier.release()
    const responses = await Promise.all(requests)
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409])
    expect(
      responses.find((response) => response.statusCode === 409)?.headers['set-cookie']
    ).toBeUndefined()
    expect(
      (await status(cookieOf(responses.find((response) => response.statusCode === 200)!)))
        .authenticated
    ).toBe(true)
  })

  it('keeps simultaneous system settings and rotates only after the credential commit', async () => {
    const cookie = await setup()
    const barrier = hold('hash', nextPassword)
    const pending = changeCredentials(cookie)
    await barrier.ready
    const system = await server.inject({
      method: 'GET',
      url: '/api/config/system',
      headers: { cookie },
    })
    const save = await server.inject({
      method: 'PUT',
      url: '/api/config/system',
      headers: { cookie, 'if-match': String(system.headers.etag) },
      payload: { ...system.json(), appName: 'Saved on another device' },
    })
    expect(save.statusCode).toBe(200)
    expect((await status(cookie)).authenticated).toBe(true)
    barrier.release()
    const changed = await pending
    expect(changed.statusCode).toBe(200)
    expect((await store.readSystemConfig()).appName).toBe('Saved on another device')
    expect((await status(cookie)).authenticated).toBe(false)
    expect((await status(cookieOf(changed))).authenticated).toBe(true)
  })

  it('does not sign in an old-password verification completing after a password change', async () => {
    const cookie = await setup()
    const barrier = hold('verify', password)
    const login = server
      .inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } })
      .then((response) => response)
    await barrier.ready
    const changed = await changeCredentials(cookie)
    expect(changed.statusCode).toBe(200)
    barrier.release()
    const late = await login
    expect(late.statusCode).toBe(409)
    expect(late.headers['set-cookie']).toBeUndefined()
    expect((await status(cookieOf(changed))).authenticated).toBe(true)
  })

  it('rejects a credential change whose original session logged out during hashing', async () => {
    const cookie = await setup()
    const original = await readFile(path.join(directory, 'config.json'), 'utf8')
    const barrier = hold('hash', nextPassword)
    const pending = changeCredentials(cookie)
    await barrier.ready
    await server.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } })
    barrier.release()
    expect((await pending).statusCode).toBe(401)
    expect(await readFile(path.join(directory, 'config.json'), 'utf8')).toBe(original)
  })

  it('rejects the second concurrent credential change instead of overwriting the first', async () => {
    const cookie = await setup()
    const barrier = hold('hash', nextPassword, 2)
    const requests = [changeCredentials(cookie), changeCredentials(cookie)]
    await barrier.ready
    barrier.release()
    const responses = await Promise.all(requests)
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409])
    expect(
      (await status(cookieOf(responses.find((response) => response.statusCode === 200)!)))
        .authenticated
    ).toBe(true)
  })

  it('performs login inspection without modifying the file and binds sessions to credentials', async () => {
    const cookie = await setup()
    const file = path.join(directory, 'config.json')
    const before = await stat(file)
    const content = await readFile(file, 'utf8')
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { username, password },
        })
      ).statusCode
    ).toBe(200)
    expect((await stat(file)).mtimeMs).toBe(before.mtimeMs)
    expect(await readFile(file, 'utf8')).toBe(content)
    const current = await store.readAppConfig()
    await store.writeAppConfig({
      ...current,
      system: { ...current.system, auth: { username, passwordHash: 'different-hash' } },
    })
    expect((await status(cookie)).authenticated).toBe(false)
  })

  it('reserves at most five concurrent login verifications', async () => {
    await setup()
    const barrier = hold('verify', 'wrong-review-password', 5)
    const requests = Array.from({ length: 12 }, () =>
      server
        .inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { username, password: 'wrong-review-password' },
        })
        .then((response) => response)
    )
    await barrier.ready
    barrier.release()
    const responses = await Promise.all(requests)
    expect(responses.filter((response) => response.statusCode === 401)).toHaveLength(5)
    expect(responses.filter((response) => response.statusCode === 429)).toHaveLength(7)
  })

  it('separates trusted proxy clients but ignores forged forwarding from untrusted peers', async () => {
    await setup()
    for (let index = 0; index < 5; index += 1) {
      expect(
        (
          await server.inject({
            method: 'POST',
            url: '/api/auth/login',
            remoteAddress: '10.0.0.5',
            headers: { 'x-forwarded-for': '198.51.100.10' },
            payload: { username, password: 'incorrect-password' },
          })
        ).statusCode
      ).toBe(401)
    }
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/auth/login',
          remoteAddress: '10.0.0.5',
          headers: { 'x-forwarded-for': '198.51.100.20' },
          payload: { username, password },
        })
      ).statusCode
    ).toBe(200)
    for (let index = 0; index < 5; index += 1) {
      expect(
        (
          await server.inject({
            method: 'POST',
            url: '/api/auth/login',
            remoteAddress: '203.0.113.1',
            headers: { 'x-forwarded-for': `198.51.100.${index}` },
            payload: { username, password: 'incorrect-password' },
          })
        ).statusCode
      ).toBe(401)
    }
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/auth/login',
          remoteAddress: '203.0.113.1',
          headers: { 'x-forwarded-for': '198.51.100.99' },
          payload: { username, password },
        })
      ).statusCode
    ).toBe(429)
  })

  it('cancels an in-flight unlock when that session locks the same scene', async () => {
    const cookie = await setup()
    await createPrivateScenes()
    const barrier = hold('verify', 'scene-password')
    const unlock = server
      .inject({
        method: 'POST',
        url: '/api/navigation/scenes/first/unlock',
        headers: { cookie },
        payload: { password: 'scene-password' },
      })
      .then((response) => response)
    await barrier.ready
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/navigation/scenes/first/lock',
          headers: { cookie },
        })
      ).statusCode
    ).toBe(200)
    barrier.release()
    expect((await unlock).statusCode).toBe(409)
  })

  it('does not cancel another scene or another session when locking one scene', async () => {
    const cookie = await setup()
    await createPrivateScenes()
    const secondLogin = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password },
    })
    const secondCookie = cookieOf(secondLogin)
    const other = await server.inject({
      method: 'POST',
      url: '/api/navigation/scenes/first/unlock',
      headers: { cookie: secondCookie },
      payload: { password: 'scene-password' },
    })
    const barrier = hold('verify', 'scene-password')
    const unlock = server
      .inject({
        method: 'POST',
        url: '/api/navigation/scenes/second/unlock',
        headers: { cookie },
        payload: { password: 'scene-password' },
      })
      .then((response) => response)
    await barrier.ready
    await server.inject({
      method: 'POST',
      url: '/api/navigation/scenes/first/lock',
      headers: { cookie },
    })
    barrier.release()
    expect((await unlock).statusCode).toBe(200)
    expect(
      (
        await server.inject({
          method: 'GET',
          url: '/api/navigation?sceneId=first',
          headers: { cookie: secondCookie, 'x-scene-token': other.json().token },
        })
      ).statusCode
    ).toBe(200)
  })

  it('cancels a late unlock after logout or a scene password commit', async () => {
    const cookie = await setup()
    await createPrivateScenes()
    const first = await server.inject({
      method: 'POST',
      url: '/api/navigation/scenes/first/unlock',
      headers: { cookie },
      payload: { password: 'scene-password' },
    })
    const config = await server.inject({
      method: 'GET',
      url: '/api/config/navigation',
      headers: { cookie },
    })
    const barrier = hold('verify', 'scene-password')
    const pending = server
      .inject({
        method: 'POST',
        url: '/api/navigation/scenes/first/unlock',
        headers: { cookie },
        payload: { password: 'scene-password' },
      })
      .then((response) => response)
    await barrier.ready
    expect(
      (
        await server.inject({
          method: 'PUT',
          url: '/api/config/navigation/scenes/first/password',
          headers: {
            cookie,
            'x-scene-token': first.json().token,
            'if-match': String(config.headers.etag),
          },
          payload: { password: 'new-scene-password' },
        })
      ).statusCode
    ).toBe(200)
    barrier.release()
    expect((await pending).statusCode).toBe(409)
    expect(
      (
        await server.inject({
          method: 'GET',
          url: '/api/navigation?sceneId=first',
          headers: { cookie, 'x-scene-token': first.json().token },
        })
      ).statusCode
    ).toBe(403)
    const logoutBarrier = hold('verify', 'scene-password')
    const secondPending = server
      .inject({
        method: 'POST',
        url: '/api/navigation/scenes/second/unlock',
        headers: { cookie },
        payload: { password: 'scene-password' },
      })
      .then((response) => response)
    await logoutBarrier.ready
    await server.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } })
    logoutBarrier.release()
    expect((await secondPending).statusCode).toBe(401)
  })
})
