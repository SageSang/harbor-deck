// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { AppConfig } from '../src/config/schema'

let directory: string
let server: FastifyInstance
let cookie: string
let original: AppConfig
const read = (url: string) => server.inject({ method: 'GET', url, headers: { cookie } })
const write = (url: string, payload: unknown, revision?: string) =>
  server.inject({
    method: 'PUT',
    url,
    headers: { cookie, ...(revision ? { 'if-match': revision } : {}) },
    payload: payload as object,
  })

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'harbordeck-web-safety-'))
  vi.stubEnv('CONFIG_DIR', directory)
  vi.stubEnv('NODE_ENV', 'test')
  vi.resetModules()
  const { buildServer } = await import('./app')
  const store = await import('./configStore')
  const { hashPassword } = await import('./password')
  server = await buildServer()
  server.log.level = 'silent'
  const setup = await server.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: { username: 'review-admin', password: 'strong-review-password' },
  })
  expect(setup.statusCode).toBe(200)
  cookie = String(setup.headers['set-cookie']).split(';')[0]
  original = await store.writeAppConfig({
    ...(await store.readAppConfig()),
    navigation: {
      defaultSceneId: 'public',
      bookmarks: [
        { slug: 'public-link', name: 'Public', primaryUrl: 'https://example.com/public' },
        {
          slug: 'private-link',
          name: 'Secret title',
          primaryUrl: 'https://example.com/private',
          note: 'secret-note-marker',
        },
      ],
      scenes: [
        {
          id: 'public',
          name: 'Public',
          groups: [{ id: 'main', name: 'Main', bookmarkIds: ['public-link'] }],
        },
        {
          id: 'private',
          name: 'Private',
          protected: true,
          passwordHash: await hashPassword('scene-password'),
          groups: [{ id: 'secret-group', name: 'Secret group', bookmarkIds: ['private-link'] }],
          quickRecords: [
            {
              id: 'secret-record',
              name: 'Secret record',
              primaryUrl: 'https://example.com/record',
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
      ],
    },
  })
})

afterEach(async () => {
  await server?.close()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})

describe('Web configuration isolation and concurrency', () => {
  it('redacts locked scenes in every Web snapshot, including write responses', async () => {
    expect((await read('/api/navigation?sceneId=private')).statusCode).toBe(403)
    for (const url of ['/api/config/navigation', '/api/config/app']) {
      const response = await read(url)
      expect(response.statusCode).toBe(200)
      expect(response.body).not.toMatch(
        /secret-note-marker|Secret title|Secret group|Secret record|passwordHash/
      )
      const saved = await write(url, response.json(), String(response.headers.etag))
      expect(saved.statusCode).toBe(200)
      expect(saved.body).not.toContain('secret-note-marker')
    }
    const stored = JSON.parse(
      await readFile(path.join(directory, 'config.json'), 'utf8')
    ) as AppConfig
    expect(stored.navigation.scenes[1]).toEqual(original.navigation.scenes[1])
    expect(
      stored.navigation.bookmarks.find((bookmark) => bookmark.slug === 'private-link')
    ).toEqual(original.navigation.bookmarks[1])
    expect(stored.navigation._revision).toBeUndefined()
    expect(stored.system._revision).toBeUndefined()
  })

  it('preserves locked content on public edits and rejects forged hidden changes', async () => {
    const response = await read('/api/config/navigation')
    const draft = response.json() as AppConfig['navigation']
    draft.scenes[0].name = 'Public updated'
    const saved = await write('/api/config/navigation', draft, String(response.headers.etag))
    expect(saved.statusCode).toBe(200)
    const forged = saved.json() as AppConfig['navigation']
    forged.scenes[1].name = 'Unauthorized rename'
    expect(
      (await write('/api/config/navigation', forged, String(saved.headers.etag))).statusCode
    ).toBe(403)
    const guessed = saved.json() as AppConfig['navigation']
    guessed.bookmarks.push({
      slug: 'private-link',
      name: 'Overwrite',
      primaryUrl: 'https://example.com/forged',
    })
    expect(
      (await write('/api/config/navigation', guessed, String(saved.headers.etag))).statusCode
    ).toBe(403)
  })

  it.each(['/api/config/navigation', '/api/config/app'])(
    'rejects new hidden references in %s without writing any state',
    async (url) => {
      const before = await readFile(path.join(directory, 'config.json'), 'utf8')
      const response = await read(url)
      for (const newScene of [false, true]) {
        const draft = response.json()
        const navigation = url.endsWith('/app') ? draft.navigation : draft
        if (newScene)
          navigation.scenes.push({
            id: 'forged',
            name: 'Forged',
            groups: [{ id: 'main', name: 'Main', bookmarkIds: ['private-link'] }],
          })
        else navigation.scenes[0].groups[0].bookmarkIds.push('private-link')
        const rejected = await write(url, draft, String(response.headers.etag))
        expect(rejected.statusCode).toBe(403)
        expect(await readFile(path.join(directory, 'config.json'), 'utf8')).toBe(before)
        expect((await read(url)).headers.etag).toBe(response.headers.etag)
      }
    }
  )

  it('allows deliberately sharing a bookmark after unlocking its source scene', async () => {
    const unlocked = await server.inject({
      method: 'POST',
      url: '/api/navigation/scenes/private/unlock',
      headers: { cookie },
      payload: { password: 'scene-password' },
    })
    const headers = { cookie, 'x-scene-tokens': JSON.stringify({ private: unlocked.json().token }) }
    const response = await server.inject({ method: 'GET', url: '/api/config/navigation', headers })
    const draft = response.json()
    draft.scenes[0].groups[0].bookmarkIds.push('private-link')
    const saved = await server.inject({
      method: 'PUT',
      url: '/api/config/navigation',
      headers: { ...headers, 'if-match': String(response.headers.etag) },
      payload: draft,
    })
    expect(saved.statusCode).toBe(200)
    expect((await read('/api/config/navigation')).body).toContain('secret-note-marker')
  })

  it('shows unlocked content and removes it again after locking', async () => {
    const unlocked = await server.inject({
      method: 'POST',
      url: '/api/navigation/scenes/private/unlock',
      headers: { cookie },
      payload: { password: 'scene-password' },
    })
    const token = unlocked.json().token as string
    const request = () =>
      server.inject({
        method: 'GET',
        url: '/api/config/navigation',
        headers: { cookie, 'x-scene-tokens': JSON.stringify({ private: token }) },
      })
    expect((await request()).body).toContain('secret-note-marker')
    await server.inject({
      method: 'POST',
      url: '/api/navigation/scenes/private/lock',
      headers: { cookie, 'x-scene-token': token },
      payload: {},
    })
    expect((await request()).body).not.toContain('secret-note-marker')
  })

  it('requires system revisions and rejects old system and whole-app drafts', async () => {
    const app = await read('/api/config/app')
    const system = await read('/api/config/system')
    const draft = system.json() as AppConfig['system']
    expect((await write('/api/config/system', draft)).statusCode).toBe(428)
    expect(
      (
        await write(
          '/api/config/system',
          { ...draft, appName: 'Newer device name' },
          String(system.headers.etag)
        )
      ).statusCode
    ).toBe(200)
    expect(
      (
        await write(
          '/api/config/system',
          { ...draft, clickOpenTarget: 'blank' },
          String(system.headers.etag)
        )
      ).statusCode
    ).toBe(412)
    expect((await write('/api/config/app', app.json(), String(app.headers.etag))).statusCode).toBe(
      412
    )
    expect((await read('/api/config/system')).json().appName).toBe('Newer device name')
  })
})
