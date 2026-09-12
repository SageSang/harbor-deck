// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '../src/config/schema.js'

const managementToken = 'management-token-that-is-longer-than-32-characters'
const managementHeaders = { 'x-harbordeck-management-token': managementToken }

let tempConfigDir = ''
let app: Awaited<ReturnType<(typeof import('./app.js'))['buildServer']>> | null = null

function baseConfig(): AppConfig {
  return {
    system: {
      appName: 'Managed Harbor',
      skin: 'midnight',
      darkMode: true,
      clickOpenTarget: 'self',
      middleClickOpenTarget: 'blank',
      defaultSearchEngine: 'google',
      customSearchEngines: [],
      networkProbe: {
        lanProtocol: 'http',
        lanHost: '',
        wanProtocol: 'https',
        wanHost: '',
      },
      webdavBackup: {
        url: 'https://backup.example.com/dav',
        username: 'private-user',
        password: 'private-password',
        remotePath: '/harbor-deck',
        autoBackup: false,
        intervalDays: 7,
        maxVersions: 10,
      },
    },
    navigation: {
      defaultSceneId: 'public',
      bookmarks: [
        {
          slug: 'alpha',
          name: 'Alpha',
          primaryUrl: 'https://alpha.example.com',
          icon: 'server',
        },
        {
          slug: 'secret-tool',
          name: 'Secret Tool',
          primaryUrl: 'https://secret.example.com',
          note: 'private note',
        },
      ],
      scenes: [
        {
          id: 'public',
          name: 'Public',
          protected: false,
          groups: [
            { id: 'main', name: 'Main', bookmarkIds: ['alpha'] },
            { id: 'archive', name: 'Archive', bookmarkIds: [] },
          ],
          quickRecords: [],
        },
        {
          id: 'private',
          name: 'Private',
          protected: true,
          passwordHash: 'private-password-hash',
          groups: [{ id: 'secrets', name: 'Secrets', bookmarkIds: ['secret-tool'] }],
          quickRecords: [
            {
              id: 'quick-private',
              name: 'Private scratch',
              primaryUrl: 'https://scratch.example.com',
              note: 'secret scratch note',
              createdAt: 100,
              updatedAt: 100,
            },
          ],
        },
      ],
    },
  }
}

async function buildTestServer() {
  vi.resetModules()
  process.env.CONFIG_DIR = tempConfigDir
  process.env.NODE_ENV = 'test'
  process.env.HARBORDECK_BOOKMARK_MANAGEMENT_TOKEN = managementToken
  await writeFile(path.join(tempConfigDir, 'config.json'), JSON.stringify(baseConfig()), 'utf8')
  const { buildServer } = await import('./app.js')
  app = await buildServer()
  return app
}

async function getState(server: NonNullable<typeof app>) {
  const response = await server.inject({
    method: 'GET',
    url: '/api/management/v1/state',
    headers: managementHeaders,
  })
  expect(response.statusCode).toBe(200)
  return { response, state: response.json() }
}

async function managementWrite(
  server: NonNullable<typeof app>,
  input: {
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    url: string
    revision: string
    payload?: unknown
    dryRun?: boolean
  }
) {
  return server.inject({
    method: input.method,
    url: input.url,
    headers: {
      ...managementHeaders,
      'if-match': `"${input.revision}"`,
      ...(input.dryRun ? { 'x-harbordeck-dry-run': 'true' } : {}),
    },
    ...(input.payload === undefined ? {} : { payload: input.payload }),
  })
}

describe('bookmark management API', () => {
  beforeEach(async () => {
    tempConfigDir = await mkdtemp(path.join(os.tmpdir(), 'harbordeck-management-'))
  })

  afterEach(async () => {
    delete process.env.CONFIG_DIR
    delete process.env.NODE_ENV
    delete process.env.HARBORDECK_BOOKMARK_MANAGEMENT_TOKEN
    delete process.env.HARBORDECK_SEARCH_TOKEN
    if (app) {
      await app.close()
      app = null
    }
    await rm(tempConfigDir, { recursive: true, force: true })
  })

  it('requires a configured independent token with at least 32 characters', async () => {
    const server = await buildTestServer()

    delete process.env.HARBORDECK_BOOKMARK_MANAGEMENT_TOKEN
    const disabled = await server.inject({ method: 'GET', url: '/api/management/v1/status' })
    expect(disabled.statusCode).toBe(503)
    expect(disabled.json().error.code).toBe('MANAGEMENT_API_DISABLED')

    process.env.HARBORDECK_BOOKMARK_MANAGEMENT_TOKEN = 'too-short'
    const invalidConfiguration = await server.inject({
      method: 'GET',
      url: '/api/management/v1/status',
      headers: { 'x-harbordeck-management-token': 'too-short' },
    })
    expect(invalidConfiguration.statusCode).toBe(503)

    process.env.HARBORDECK_BOOKMARK_MANAGEMENT_TOKEN = managementToken
    process.env.HARBORDECK_SEARCH_TOKEN = managementToken
    const missing = await server.inject({ method: 'GET', url: '/api/management/v1/status' })
    const searchHeaderOnly = await server.inject({
      method: 'GET',
      url: '/api/management/v1/status',
      headers: { 'x-harbordeck-search-token': managementToken },
    })
    const browserCredentialsOnly = await server.inject({
      method: 'GET',
      url: '/api/management/v1/status',
      headers: { cookie: 'harbor_session=fake', 'x-scene-token': 'fake-scene-token' },
    })
    const valid = await server.inject({
      method: 'GET',
      url: '/api/management/v1/status',
      headers: managementHeaders,
    })

    expect(missing.statusCode).toBe(401)
    expect(searchHeaderOnly.statusCode).toBe(401)
    expect(browserCredentialsOnly.statusCode).toBe(401)
    expect(valid.statusCode).toBe(200)
    expect(valid.json()).toMatchObject({
      ok: true,
      apiVersion: 1,
      counts: { scenes: 2, groups: 3, bookmarks: 2, quickRecords: 1 },
    })
  })

  it('returns protected bookmark data without returning passwords or system secrets', async () => {
    const server = await buildTestServer()
    const { response, state } = await getState(server)
    const serialized = JSON.stringify(state)

    expect(response.headers.etag).toBe(`"${state.revision}"`)
    expect(state.scenes.find((scene: { id: string }) => scene.id === 'private')).toMatchObject({
      protected: true,
      quickRecords: [{ id: 'quick-private', note: 'secret scratch note' }],
    })
    expect(
      state.bookmarks.find((bookmark: { slug: string }) => bookmark.slug === 'secret-tool')
    ).toMatchObject({
      note: 'private note',
      placements: [{ sceneId: 'private', groupId: 'secrets', position: 0 }],
    })
    expect(serialized).not.toContain('passwordHash')
    expect(serialized).not.toContain('private-password')
    expect(serialized).not.toContain('private-user')
    expect(serialized).not.toContain(managementToken)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers.pragma).toBe('no-cache')
    expect(response.headers.vary).toBe('X-HarborDeck-Management-Token')
    expect(response.headers['x-content-type-options']).toBe('nosniff')

    const search = await server.inject({
      method: 'GET',
      url: '/api/management/v1/search?q=secret&sceneId=private&type=all',
      headers: managementHeaders,
    })
    expect(search.statusCode).toBe(200)
    expect(search.json().items).toHaveLength(2)

    const icons = await server.inject({
      method: 'GET',
      url: '/api/management/v1/icons?q=server&limit=10',
      headers: managementHeaders,
    })
    expect(icons.statusCode).toBe(200)
    expect(icons.json().items).toContainEqual({ id: 'server', label: 'Server' })
  })

  it('creates, renames, reorders and safely deletes groups', async () => {
    const server = await buildTestServer()
    let { state } = await getState(server)

    const created = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/scenes/private/groups',
      revision: state.revision,
      payload: { id: 'ai-tools', name: 'AI Tools', position: 0 },
    })
    expect(created.statusCode).toBe(201)
    state = (await getState(server)).state

    const renamed = await managementWrite(server, {
      method: 'PATCH',
      url: '/api/management/v1/scenes/private/groups/ai-tools',
      revision: state.revision,
      payload: { name: 'AI and Automation' },
    })
    expect(renamed.statusCode).toBe(200)
    state = (await getState(server)).state

    const reordered = await managementWrite(server, {
      method: 'PUT',
      url: '/api/management/v1/scenes/private/groups/order',
      revision: state.revision,
      payload: { groupIds: ['secrets', 'ai-tools'] },
    })
    expect(reordered.statusCode).toBe(200)
    state = (await getState(server)).state

    const rejected = await managementWrite(server, {
      method: 'DELETE',
      url: '/api/management/v1/scenes/private/groups/secrets',
      revision: state.revision,
    })
    expect(rejected.statusCode).toBe(409)
    expect(rejected.json().error.code).toBe('GROUP_NOT_EMPTY')

    const moved = await managementWrite(server, {
      method: 'DELETE',
      url: '/api/management/v1/scenes/private/groups/secrets?bookmarkDisposition=move&targetGroupId=ai-tools&targetPosition=0',
      revision: state.revision,
    })
    expect(moved.statusCode).toBe(200)
    state = (await getState(server)).state
    expect(state.scenes.find((scene: { id: string }) => scene.id === 'private').groups).toEqual([
      expect.objectContaining({
        id: 'ai-tools',
        name: 'AI and Automation',
        bookmarkIds: ['secret-tool'],
      }),
    ])

    const removed = await managementWrite(server, {
      method: 'DELETE',
      url: '/api/management/v1/scenes/private/groups/ai-tools?bookmarkDisposition=remove',
      revision: state.revision,
    })
    expect(removed.statusCode).toBe(200)
    expect(removed.json().result.deletedBookmarks).toEqual(['secret-tool'])
  })

  it('creates, edits, duplicates, moves, orders and deletes bookmarks', async () => {
    const server = await buildTestServer()
    let { state } = await getState(server)

    const invalidIcon = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/bookmarks',
      revision: state.revision,
      payload: {
        name: 'Invalid icon',
        icon: 'definitely-not-an-icon',
        primaryUrl: 'https://invalid.example.com',
        placements: [{ sceneId: 'public', groupId: 'main' }],
      },
    })
    expect(invalidIcon.statusCode).toBe(422)
    expect(invalidIcon.json().error.code).toBe('INVALID_ICON')

    const created = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/bookmarks',
      revision: state.revision,
      payload: {
        slug: 'beta',
        name: 'Beta',
        note: 'new bookmark',
        icon: 'database',
        primaryUrl: 'https://beta.example.com',
        secondaryUrl: 'https://beta-alt.example.com',
        probes: ['https://beta.example.com/health'],
        forceNewTab: true,
        placements: [
          { sceneId: 'public', groupId: 'main', position: 0 },
          { sceneId: 'private', groupId: 'secrets' },
        ],
      },
    })
    expect(created.statusCode).toBe(201)
    state = (await getState(server)).state

    const updated = await managementWrite(server, {
      method: 'PATCH',
      url: '/api/management/v1/bookmarks/beta',
      revision: state.revision,
      payload: { slug: 'beta-renamed', name: 'Beta Updated', note: null, secondaryUrl: null },
    })
    expect(updated.statusCode).toBe(200)
    state = (await getState(server)).state
    expect(JSON.stringify(state.scenes)).not.toContain('"beta"')
    expect(
      state.bookmarks.find((bookmark: { slug: string }) => bookmark.slug === 'beta-renamed')
    ).toMatchObject({
      name: 'Beta Updated',
      forceNewTab: true,
    })

    const duplicated = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/bookmarks/beta-renamed/duplicate',
      revision: state.revision,
      payload: { slug: 'beta-copy' },
    })
    expect(duplicated.statusCode).toBe(201)
    state = (await getState(server)).state

    const moved = await managementWrite(server, {
      method: 'PUT',
      url: '/api/management/v1/scenes/public/bookmarks/beta-copy/placement',
      revision: state.revision,
      payload: { groupId: 'archive', position: 0 },
    })
    expect(moved.statusCode).toBe(200)
    state = (await getState(server)).state

    const order = await managementWrite(server, {
      method: 'PUT',
      url: '/api/management/v1/scenes/public/groups/main/bookmarks/order',
      revision: state.revision,
      payload: { bookmarkIds: ['alpha', 'beta-renamed'] },
    })
    expect(order.statusCode).toBe(200)
    state = (await getState(server)).state

    const deleted = await managementWrite(server, {
      method: 'DELETE',
      url: '/api/management/v1/bookmarks/beta-copy',
      revision: state.revision,
    })
    expect(deleted.statusCode).toBe(200)
    expect(deleted.json().result.placements).toHaveLength(2)
  })

  it('supports batch placement, movement and orphan-aware removal atomically', async () => {
    const server = await buildTestServer()
    let { state } = await getState(server)

    const batchPlace = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/bookmarks/batch-place',
      revision: state.revision,
      payload: {
        bookmarkIds: ['alpha', 'secret-tool'],
        placements: [{ sceneId: 'public', groupId: 'archive' }],
        conflictPolicy: 'move',
      },
    })
    expect(batchPlace.statusCode).toBe(200)
    state = (await getState(server)).state

    const batchMove = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/scenes/public/bookmarks/batch-move',
      revision: state.revision,
      payload: {
        bookmarkIds: ['alpha', 'secret-tool'],
        targetGroupId: 'main',
        position: 0,
      },
    })
    expect(batchMove.statusCode).toBe(200)
    state = (await getState(server)).state

    const rejected = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/scenes/private/bookmarks/batch-remove',
      revision: state.revision,
      payload: { bookmarkIds: ['secret-tool'], orphanPolicy: 'reject' },
    })
    expect(rejected.statusCode).toBe(200)
    state = (await getState(server)).state

    const removed = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/scenes/public/bookmarks/batch-remove',
      revision: state.revision,
      payload: { bookmarkIds: ['secret-tool'], orphanPolicy: 'delete' },
    })
    expect(removed.statusCode).toBe(200)
    expect(removed.json().result.deletedBookmarks).toEqual(['secret-tool'])
  })

  it('creates, updates, promotes and deletes quick records', async () => {
    const server = await buildTestServer()
    let { state } = await getState(server)

    const created = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/scenes/private/quick-records',
      revision: state.revision,
      payload: {
        name: 'Candidate',
        primaryUrl: 'https://candidate.example.com',
        note: 'review later',
      },
    })
    expect(created.statusCode).toBe(201)
    const recordId = created.json().result.quickRecord.id as string
    state = (await getState(server)).state

    const updated = await managementWrite(server, {
      method: 'PATCH',
      url: `/api/management/v1/scenes/private/quick-records/${recordId}`,
      revision: state.revision,
      payload: { name: 'Candidate Updated', note: null },
    })
    expect(updated.statusCode).toBe(200)
    state = (await getState(server)).state

    const promoted = await managementWrite(server, {
      method: 'POST',
      url: `/api/management/v1/scenes/private/quick-records/${recordId}/promote`,
      revision: state.revision,
      payload: {
        slug: 'candidate',
        placements: [{ sceneId: 'private', groupId: 'secrets', position: 0 }],
        reuseExistingByUrl: true,
      },
    })
    expect(promoted.statusCode).toBe(200)
    expect(promoted.json().result).toMatchObject({ created: true, removedQuickRecordId: recordId })
    state = (await getState(server)).state

    const deleted = await managementWrite(server, {
      method: 'DELETE',
      url: '/api/management/v1/scenes/private/quick-records/quick-private',
      revision: state.revision,
    })
    expect(deleted.statusCode).toBe(200)

    state = (await getState(server)).state
    const matchingRecord = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/scenes/private/quick-records',
      revision: state.revision,
      payload: { name: 'Existing Alpha', primaryUrl: 'https://alpha.example.com' },
    })
    const matchingRecordId = matchingRecord.json().result.quickRecord.id as string
    state = (await getState(server)).state
    const reused = await managementWrite(server, {
      method: 'POST',
      url: `/api/management/v1/scenes/private/quick-records/${matchingRecordId}/promote`,
      revision: state.revision,
      payload: {
        placements: [{ sceneId: 'private', groupId: 'secrets' }],
        reuseExistingByUrl: true,
      },
    })
    expect(reused.statusCode).toBe(200)
    expect(reused.json().result).toMatchObject({
      created: false,
      removedQuickRecordId: matchingRecordId,
    })
    expect(reused.json().result.bookmark.slug).toBe('alpha')
  })

  it('fills only missing icons in selected scenes', async () => {
    const server = await buildTestServer()
    let { state } = await getState(server)

    const filled = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/icons/fill-missing',
      revision: state.revision,
      payload: { sceneIds: ['private'] },
    })
    expect(filled.statusCode).toBe(200)
    expect(filled.json().result).toMatchObject({ updatedBookmarks: 1, updatedQuickRecords: 1 })

    state = (await getState(server)).state
    expect(
      state.bookmarks.find((bookmark: { slug: string }) => bookmark.slug === 'alpha').icon
    ).toBe('server')
    expect(
      state.bookmarks.find((bookmark: { slug: string }) => bookmark.slug === 'secret-tool').icon
    ).toBeTruthy()
    expect(
      state.scenes.find((scene: { id: string }) => scene.id === 'private').quickRecords[0].icon
    ).toBeTruthy()
  })

  it('accepts legacy long bookmark slugs for management updates', async () => {
    const server = await buildTestServer()
    let { state } = await getState(server)
    const longSlug = `legacy-${'x'.repeat(110)}`

    const created = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/bookmarks',
      revision: state.revision,
      payload: {
        slug: longSlug,
        name: 'Legacy bookmark',
        icon: 'server',
        primaryUrl: 'https://legacy-long-slug.example.com',
        placements: [{ sceneId: 'public', groupId: 'main' }],
      },
    })
    expect(created.statusCode).toBe(201)
    state = (await getState(server)).state

    const renamed = await managementWrite(server, {
      method: 'PATCH',
      url: `/api/management/v1/bookmarks/${longSlug}`,
      revision: state.revision,
      payload: { name: 'Legacy bookmark｜已整理' },
    })
    expect(renamed.statusCode).toBe(200)
    expect((await getState(server)).state.bookmarks).toContainEqual(
      expect.objectContaining({ slug: longSlug, name: 'Legacy bookmark｜已整理' })
    )
  })

  it('requires current revisions, keeps dry-runs side-effect free, and protects web saves', async () => {
    const server = await buildTestServer()
    const { state } = await getState(server)

    const missingRevision = await server.inject({
      method: 'POST',
      url: '/api/management/v1/scenes/public/groups',
      headers: managementHeaders,
      payload: { name: 'No Revision' },
    })
    expect(missingRevision.statusCode).toBe(428)

    const malformedRevision = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/scenes/public/groups',
      revision: 'sha256:not-a-revision',
      payload: { name: 'Malformed Revision' },
    })
    expect(malformedRevision.statusCode).toBe(400)
    expect(malformedRevision.json().error.code).toBe('INVALID_IF_MATCH')

    const malformedQuery = await server.inject({
      method: 'GET',
      url: '/api/management/v1/search?q=alpha&type=invalid',
      headers: managementHeaders,
    })
    expect(malformedQuery.statusCode).toBe(400)
    expect(malformedQuery.json().error.code).toBe('INVALID_REQUEST')

    const malformedDryRun = await server.inject({
      method: 'POST',
      url: '/api/management/v1/scenes/public/groups',
      headers: {
        ...managementHeaders,
        'if-match': `"${state.revision}"`,
        'x-harbordeck-dry-run': 'yes',
      },
      payload: { name: 'Malformed Dry Run' },
    })
    expect(malformedDryRun.statusCode).toBe(400)
    expect(malformedDryRun.json().error.code).toBe('INVALID_DRY_RUN_HEADER')

    const dryRun = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/scenes/public/groups',
      revision: state.revision,
      payload: { name: 'Preview Group' },
      dryRun: true,
    })
    expect(dryRun.statusCode).toBe(200)
    expect(dryRun.json()).toMatchObject({ committed: false, baseRevision: state.revision })
    expect((await getState(server)).state.revision).toBe(state.revision)

    const committed = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/scenes/public/groups',
      revision: state.revision,
      payload: { name: 'Committed Group' },
    })
    expect(committed.statusCode).toBe(201)

    const stale = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/scenes/public/groups',
      revision: state.revision,
      payload: { name: 'Stale Group' },
    })
    expect(stale.statusCode).toBe(412)
    expect(stale.json().error.code).toBe('REVISION_MISMATCH')

    const setup = await server.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'admin-user', password: 'strong-password-123' },
    })
    const cookieHeader = setup.headers['set-cookie']
    const cookie = String(Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader).split(
      ';'
    )[0]
    const webRead = await server.inject({
      method: 'GET',
      url: '/api/config/navigation',
      headers: { cookie },
    })
    const latest = await getState(server)
    const aiWrite = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/scenes/public/groups',
      revision: latest.state.revision,
      payload: { name: 'AI Concurrent Group' },
    })
    expect(aiWrite.statusCode).toBe(201)

    const staleWebSave = await server.inject({
      method: 'PUT',
      url: '/api/config/navigation',
      headers: { cookie, 'if-match': String(webRead.headers.etag) },
      payload: webRead.json(),
    })
    expect(staleWebSave.statusCode).toBe(412)

    const stored = JSON.parse(await readFile(path.join(tempConfigDir, 'config.json'), 'utf8'))
    expect(JSON.stringify(stored.navigation)).toContain('AI Concurrent Group')
  })

  it('rate limits writes independently from reads', async () => {
    const server = await buildTestServer()
    const staleRevision = `sha256:${'0'.repeat(64)}`
    let response = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/scenes/public/groups',
      revision: staleRevision,
      payload: { name: 'Rate limited' },
    })
    expect(response.statusCode).toBe(412)

    for (let index = 1; index < 30; index += 1) {
      response = await managementWrite(server, {
        method: 'POST',
        url: '/api/management/v1/scenes/public/groups',
        revision: staleRevision,
        payload: { name: 'Rate limited' },
      })
      expect(response.statusCode).toBe(412)
    }

    response = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/scenes/public/groups',
      revision: staleRevision,
      payload: { name: 'Rate limited' },
    })
    expect(response.statusCode).toBe(429)
    expect(response.json().error.code).toBe('RATE_LIMITED')
    expect(response.headers['retry-after']).toBeDefined()
  })
  it.each([257, 4096])(
    'manages a historical %i-character slug through bounded body aliases',
    async (length) => {
      const server = await buildTestServer()
      const legacy = 'a'.repeat(length)
      const config = baseConfig()
      config.navigation.bookmarks[0].slug = legacy
      config.navigation.scenes[0].groups[0].bookmarkIds = [legacy]
      await writeFile(path.join(tempConfigDir, 'config.json'), JSON.stringify(config))
      const initial = await getState(server)
      expect(
        initial.state.bookmarks.some((bookmark: { slug: string }) => bookmark.slug === legacy)
      ).toBe(true)
      const before = await readFile(path.join(tempConfigDir, 'config.json'), 'utf8')
      const preview = await managementWrite(server, {
        method: 'POST',
        url: '/api/management/v1/bookmarks/update',
        revision: initial.state.revision,
        payload: { slug: legacy, patch: { name: 'Preview' } },
        dryRun: true,
      })
      expect(preview.statusCode).toBe(200)
      expect(preview.json().committed).toBe(false)
      expect(await readFile(path.join(tempConfigDir, 'config.json'), 'utf8')).toBe(before)
      const update = await managementWrite(server, {
        method: 'POST',
        url: '/api/management/v1/bookmarks/update',
        revision: initial.state.revision,
        payload: { slug: legacy, patch: { slug: legacy, name: 'Renamed' } },
      })
      expect(update.statusCode).toBe(200)
      expect(update.json().result.bookmark.slug).toBe(legacy)
      const placement = await managementWrite(server, {
        method: 'POST',
        url: '/api/management/v1/bookmarks/set-placement',
        revision: update.json().revision,
        payload: { slug: legacy, sceneId: 'private', groupId: 'secrets', position: 0 },
      })
      expect(placement.statusCode).toBe(200)
      const copy = await managementWrite(server, {
        method: 'POST',
        url: '/api/management/v1/bookmarks/duplicate',
        revision: placement.json().revision,
        payload: { slug: legacy, options: {} },
      })
      expect(copy.statusCode).toBe(201)
      expect(copy.json().result.bookmark.slug.length).toBeLessThanOrEqual(256)
      const stale = await managementWrite(server, {
        method: 'POST',
        url: '/api/management/v1/bookmarks/delete',
        revision: initial.state.revision,
        payload: { slug: legacy },
      })
      expect(stale.statusCode).toBe(412)
      const deleted = await managementWrite(server, {
        method: 'POST',
        url: '/api/management/v1/bookmarks/delete',
        revision: copy.json().revision,
        payload: { slug: legacy },
      })
      expect(deleted.statusCode).toBe(200)
      const saved = JSON.parse(await readFile(path.join(tempConfigDir, 'config.json'), 'utf8'))
      expect(JSON.stringify(saved.navigation)).not.toContain(legacy)
      expect(
        saved.navigation.bookmarks.some(
          (bookmark: { slug: string }) => bookmark.slug === copy.json().result.bookmark.slug
        )
      ).toBe(true)
    }
  )

  it('bounds new IDs without tightening persisted or referenced IDs', async () => {
    const server = await buildTestServer()
    const initial = await getState(server)
    const create = (slug: string, revision: string) =>
      managementWrite(server, {
        method: 'POST',
        url: '/api/management/v1/bookmarks',
        revision,
        payload: {
          slug,
          name: 'Boundary',
          primaryUrl: 'https://example.com/new',
          placements: [{ sceneId: 'public', groupId: 'main' }],
        },
      })
    expect((await create('b'.repeat(257), initial.state.revision)).statusCode).toBe(422)
    const valid = await create('b'.repeat(256), initial.state.revision)
    expect(valid.statusCode).toBe(201)
    const before = await readFile(path.join(tempConfigDir, 'config.json'), 'utf8')
    const oversized = await managementWrite(server, {
      method: 'POST',
      url: '/api/management/v1/bookmarks/update',
      revision: valid.json().revision,
      payload: { slug: 'alpha', patch: { note: '界'.repeat(360_000) } },
    })
    expect(oversized.statusCode).toBe(413)
    expect(oversized.json().error.code).toBe('PAYLOAD_TOO_LARGE')
    expect(await readFile(path.join(tempConfigDir, 'config.json'), 'utf8')).toBe(before)
  })
})
