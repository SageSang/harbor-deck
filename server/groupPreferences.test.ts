// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

async function setupAdmin(server: NonNullable<typeof app>) {
  const response = await server.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: {
      username: 'admin-user',
      password: 'strong-password-123',
    },
  })

  expect(response.statusCode).toBe(200)
  return getSessionCookie(response)
}

async function configureNavigation(server: NonNullable<typeof app>, cookie: string) {
  const current = await server.inject({
    method: 'GET',
    url: '/api/config/navigation',
    headers: { cookie },
  })
  const response = await server.inject({
    method: 'PUT',
    url: '/api/config/navigation',
    headers: { cookie, 'if-match': String(current.headers.etag) },
    payload: {
      defaultSceneId: 'personal',
      bookmarks: [],
      scenes: [
        {
          id: 'personal',
          name: 'Personal',
          groups: [
            { id: 'main', name: 'Main', bookmarkIds: [] },
            { id: 'tools', name: 'Tools', bookmarkIds: [] },
          ],
        },
        {
          id: 'work',
          name: 'Work',
          groups: [{ id: 'services', name: 'Services', bookmarkIds: [] }],
        },
      ],
    },
  })

  expect(response.statusCode).toBe(200)
}

describe('navigation group preferences API', () => {
  beforeEach(async () => {
    tempConfigDir = await mkdtemp(path.join(os.tmpdir(), 'harbordeck-groups-'))
  })

  afterEach(async () => {
    delete process.env.CONFIG_DIR
    delete process.env.NODE_ENV

    if (app) {
      await app.close()
      app = null
    }

    await rm(tempConfigDir, { recursive: true, force: true })
    tempConfigDir = ''
  })

  it('requires an authenticated administrator', async () => {
    const server = await buildTestServer()

    const beforeSetup = await server.inject({
      method: 'GET',
      url: '/api/preferences/navigation/groups',
    })
    expect(beforeSetup.statusCode).toBe(428)

    await setupAdmin(server)
    const afterSetup = await server.inject({
      method: 'GET',
      url: '/api/preferences/navigation/groups',
    })
    expect(afterSetup.statusCode).toBe(401)
  })

  it('initializes once, cleans keys, and preserves existing server state', async () => {
    const server = await buildTestServer()
    const cookie = await setupAdmin(server)
    await configureNavigation(server, cookie)

    const initial = await server.inject({
      method: 'GET',
      url: '/api/preferences/navigation/groups',
      headers: { cookie },
    })
    expect(initial.statusCode).toBe(200)
    expect(initial.json()).toEqual({
      initialized: false,
      version: 1,
      expandedGroupKeys: [],
    })

    const initialized = await server.inject({
      method: 'POST',
      url: '/api/preferences/navigation/groups/initialize',
      headers: { cookie },
      payload: {
        expandedGroupKeys: ['personal:main', 'personal:missing', 'personal:main'],
      },
    })
    expect(initialized.statusCode).toBe(200)
    expect(initialized.json()).toEqual({
      initialized: true,
      version: 1,
      expandedGroupKeys: ['personal:main'],
    })

    const repeated = await server.inject({
      method: 'POST',
      url: '/api/preferences/navigation/groups/initialize',
      headers: { cookie },
      payload: { expandedGroupKeys: [] },
    })
    expect(repeated.statusCode).toBe(200)
    expect(repeated.json()).toEqual(initialized.json())
  })

  it('updates one group without overwriting unrelated concurrent changes', async () => {
    const server = await buildTestServer()
    const cookie = await setupAdmin(server)
    await configureNavigation(server, cookie)

    await server.inject({
      method: 'POST',
      url: '/api/preferences/navigation/groups/initialize',
      headers: { cookie },
      payload: { expandedGroupKeys: [] },
    })

    const responses = await Promise.all(
      ['main', 'tools'].map((groupId) =>
        server.inject({
          method: 'PUT',
          url: `/api/preferences/navigation/scenes/personal/groups/${groupId}`,
          headers: { cookie },
          payload: { expanded: true },
        })
      )
    )
    expect(responses.every((response) => response.statusCode === 200)).toBe(true)

    const current = await server.inject({
      method: 'GET',
      url: '/api/preferences/navigation/groups',
      headers: { cookie },
    })
    expect(new Set(current.json().expandedGroupKeys)).toEqual(
      new Set(['personal:main', 'personal:tools'])
    )

    const collapsed = await server.inject({
      method: 'PUT',
      url: '/api/preferences/navigation/scenes/personal/groups/main',
      headers: { cookie },
      payload: { expanded: false },
    })
    expect(collapsed.statusCode).toBe(200)
    expect(collapsed.json().expandedGroupKeys).toEqual(['personal:tools'])

    const repeated = await server.inject({
      method: 'PUT',
      url: '/api/preferences/navigation/scenes/personal/groups/main',
      headers: { cookie },
      payload: { expanded: false },
    })
    expect(repeated.json()).toEqual(collapsed.json())
  })

  it('updates a whole scene, rejects unknown targets, and cleans deleted groups', async () => {
    const server = await buildTestServer()
    const cookie = await setupAdmin(server)
    await configureNavigation(server, cookie)

    await server.inject({
      method: 'POST',
      url: '/api/preferences/navigation/groups/initialize',
      headers: { cookie },
      payload: { expandedGroupKeys: ['work:services'] },
    })

    const expanded = await server.inject({
      method: 'PUT',
      url: '/api/preferences/navigation/scenes/personal/groups',
      headers: { cookie },
      payload: { expanded: true },
    })
    expect(expanded.statusCode).toBe(200)
    expect(expanded.json().expandedGroupKeys).toEqual([
      'work:services',
      'personal:main',
      'personal:tools',
    ])

    const collapsed = await server.inject({
      method: 'PUT',
      url: '/api/preferences/navigation/scenes/personal/groups',
      headers: { cookie },
      payload: { expanded: false },
    })
    expect(collapsed.json().expandedGroupKeys).toEqual(['work:services'])

    const unknownScene = await server.inject({
      method: 'PUT',
      url: '/api/preferences/navigation/scenes/missing/groups',
      headers: { cookie },
      payload: { expanded: true },
    })
    expect(unknownScene.statusCode).toBe(404)

    const unknownGroup = await server.inject({
      method: 'PUT',
      url: '/api/preferences/navigation/scenes/personal/groups/missing',
      headers: { cookie },
      payload: { expanded: true },
    })
    expect(unknownGroup.statusCode).toBe(404)

    const navigationResponse = await server.inject({
      method: 'GET',
      url: '/api/config/navigation',
      headers: { cookie },
    })
    const navigation = navigationResponse.json()
    navigation.scenes = navigation.scenes.filter((scene: { id: string }) => scene.id !== 'work')
    const savedNavigation = await server.inject({
      method: 'PUT',
      url: '/api/config/navigation',
      headers: { cookie, 'if-match': String(navigationResponse.headers.etag) },
      payload: navigation,
    })
    expect(savedNavigation.statusCode).toBe(200)

    const cleaned = await server.inject({
      method: 'GET',
      url: '/api/preferences/navigation/groups',
      headers: { cookie },
    })
    expect(cleaned.json().expandedGroupKeys).toEqual([])
  })

  it('preserves UI preferences when saving a sanitized app config', async () => {
    const server = await buildTestServer()
    const cookie = await setupAdmin(server)
    await configureNavigation(server, cookie)

    await server.inject({
      method: 'POST',
      url: '/api/preferences/navigation/groups/initialize',
      headers: { cookie },
      payload: { expandedGroupKeys: ['personal:tools'] },
    })

    const appConfigResponse = await server.inject({
      method: 'GET',
      url: '/api/config/app',
      headers: { cookie },
    })
    const appConfig = appConfigResponse.json()
    expect(appConfig.uiPreferences).toBeUndefined()

    const [saved, groupUpdate] = await Promise.all([
      server.inject({
        method: 'PUT',
        url: '/api/config/app',
        headers: { cookie, 'if-match': String(appConfigResponse.headers.etag) },
        payload: appConfig,
      }),
      server.inject({
        method: 'PUT',
        url: '/api/preferences/navigation/scenes/personal/groups/main',
        headers: { cookie },
        payload: { expanded: true },
      }),
    ])
    expect(saved.statusCode).toBe(200)
    expect(groupUpdate.statusCode).toBe(200)

    const preference = await server.inject({
      method: 'GET',
      url: '/api/preferences/navigation/groups',
      headers: { cookie },
    })
    expect(new Set(preference.json().expandedGroupKeys)).toEqual(
      new Set(['personal:main', 'personal:tools'])
    )
  })
})
