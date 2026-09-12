// @vitest-environment node

import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appConfigSchema, type NavigationConfig, type SystemConfig } from '../src/config/schema.js'

let tempConfigDir = ''

async function loadConfigStore() {
  vi.resetModules()
  process.env.CONFIG_DIR = tempConfigDir
  return import('./configStore.js')
}

describe('configStore', () => {
  beforeEach(async () => {
    tempConfigDir = await mkdtemp(path.join(os.tmpdir(), 'harbordeck-config-'))
  })

  afterEach(async () => {
    delete process.env.CONFIG_DIR
    await rm(tempConfigDir, { recursive: true, force: true })
  })

  it('inspects committed state in queue order without rewriting the file', async () => {
    const configStore = await loadConfigStore()
    await configStore.readAppConfig()
    const file = path.join(tempConfigDir, 'config.json')
    const before = await stat(file)
    const content = await readFile(file, 'utf8')
    expect(await configStore.inspectAppConfig((current) => current.system.appName)).toBe(
      'HarborDeck'
    )
    expect((await stat(file)).mtimeMs).toBe(before.mtimeMs)
    expect(await readFile(file, 'utf8')).toBe(content)
    const events: string[] = []
    const write = configStore.commitAuthConfig({
      expectedAuth: null,
      auth: { username: 'review-admin', passwordHash: 'new-hash' },
      onCommitted() {
        expect(JSON.parse(readFileSync(file, 'utf8')).system.auth.passwordHash).toBe('new-hash')
        events.push('invalidated')
      },
    })
    const inspected = configStore.inspectAppConfig((current) => {
      events.push('inspected')
      return current.system.auth?.passwordHash
    })
    await write
    expect(await inspected).toBe('new-hash')
    expect(events).toEqual(['invalidated', 'inspected'])
  })

  it('does not change auth or sessions when final validation fails before rename', async () => {
    const configStore = await loadConfigStore()
    await configStore.readAppConfig()
    const original = await readFile(path.join(tempConfigDir, 'config.json'), 'utf8')
    const onCommitted = vi.fn()
    let checks = 0
    await expect(
      configStore.commitAuthConfig({
        expectedAuth: null,
        auth: { username: 'review-admin', passwordHash: 'new-hash' },
        assertSessionValid() {
          if (++checks === 2) throw new Error('session cancelled')
        },
        onCommitted,
      })
    ).rejects.toThrow('session cancelled')
    expect(checks).toBe(2)
    expect(onCommitted).not.toHaveBeenCalled()
    expect(await readFile(path.join(tempConfigDir, 'config.json'), 'utf8')).toBe(original)
  })

  it('compares restore auth to the latest queued state and invalidates before releasing the queue', async () => {
    const configStore = await loadConfigStore()
    const original = await configStore.readAppConfig()
    const replacement = {
      ...original,
      system: {
        ...original.system,
        auth: { username: 'review-admin', passwordHash: 'replacement-hash' },
      },
    }
    const write = configStore.writeAppConfig(replacement)
    let invalidated = false
    const restored = configStore.commitRestoredAppConfig(
      original,
      () => true,
      (requiresReauth) => {
        expect(requiresReauth).toBe(true)
        invalidated = true
      }
    )
    const read = configStore.inspectAppConfig(() => invalidated)
    await write
    expect((await restored).requiresReauth).toBe(true)
    expect(await read).toBe(true)
    const sameAuth = vi.fn()
    expect(
      (await configStore.commitRestoredAppConfig(original, () => true, sameAuth)).requiresReauth
    ).toBe(false)
    expect(sameAuth).toHaveBeenCalledWith(false)
  })

  it('cancels restore immediately before rename and reports post-commit failures truthfully', async () => {
    const configStore = await loadConfigStore()
    const original = await configStore.readAppConfig()
    const replacement = { ...original, system: { ...original.system, appName: 'Restored name' } }
    const onCommitted = vi.fn()
    let checks = 0
    await expect(
      configStore.commitRestoredAppConfig(replacement, () => ++checks === 1, onCommitted)
    ).rejects.toThrow('恢复已取消')
    expect(onCommitted).not.toHaveBeenCalled()
    expect(await configStore.readAppConfig()).toEqual(original)
    await expect(
      configStore.commitRestoredAppConfig(
        replacement,
        () => true,
        () => {
          throw new Error('invalidation failed')
        }
      )
    ).rejects.toMatchObject({ committed: true })
    expect((await configStore.readAppConfig()).system.appName).toBe('Restored name')
  })

  it('creates a clean default navigation config when no file exists', async () => {
    const configStore = await loadConfigStore()
    const config = await configStore.readAppConfig()
    expect(config).toEqual(appConfigSchema.parse({}))
  })

  it('preserves the other section when updating navigation or system config', async () => {
    const configStore = await loadConfigStore()
    const nextSystem: SystemConfig = {
      ...appConfigSchema.parse({}).system,
      appName: 'Single File Harbor',
      darkMode: true,
    }
    const nextNavigation: NavigationConfig = {
      ...appConfigSchema.parse({}).navigation,
      bookmarks: [
        {
          slug: 'toolbox',
          name: 'Toolbox',
          primaryUrl: 'http://127.0.0.1:4000',
          secondaryUrl: 'https://toolbox.example.com',
        },
      ],
      scenes: [
        {
          id: 'default',
          name: '默认',
          protected: false,
          groups: [{ id: 'tools', name: '工具', bookmarkIds: ['toolbox'] }],
          quickRecords: [],
        },
      ],
    }

    await configStore.writeSystemConfig(nextSystem)
    await configStore.writeNavigationConfig(nextNavigation)
    const storedConfig = JSON.parse(await readFile(path.join(tempConfigDir, 'config.json'), 'utf8'))

    expect(storedConfig.system).toEqual(nextSystem)
    expect(storedConfig.navigation).toEqual(nextNavigation)
  })

  it('fills missing sections with defaults while keeping existing system values', async () => {
    await writeFile(
      path.join(tempConfigDir, 'config.json'),
      JSON.stringify({ system: { appName: 'Partial Harbor' } }),
      'utf8'
    )
    const configStore = await loadConfigStore()
    const config = await configStore.readAppConfig()
    expect(config.system.appName).toBe('Partial Harbor')
    expect(config.navigation.scenes).toHaveLength(1)
  })

  it('treats a blank config file as defaults', async () => {
    await writeFile(path.join(tempConfigDir, 'config.json'), '   \n', 'utf8')
    const configStore = await loadConfigStore()
    expect(await configStore.readAppConfig()).toEqual(appConfigSchema.parse({}))
  })

  it('cleans duplicate and unknown preference keys when reading a stored config', async () => {
    await writeFile(
      path.join(tempConfigDir, 'config.json'),
      JSON.stringify({
        navigation: {
          defaultSceneId: 'default',
          bookmarks: [],
          scenes: [
            {
              id: 'default',
              name: 'Default',
              groups: [{ id: 'tools', name: 'Tools', bookmarkIds: [] }],
            },
          ],
        },
        uiPreferences: {
          groupExpansion: {
            version: 1,
            expandedGroupKeys: ['default:tools', 'missing:group', 'default:tools'],
          },
        },
      }),
      'utf8'
    )
    const configStore = await loadConfigStore()

    expect(
      (await configStore.readAppConfig()).uiPreferences?.groupExpansion?.expandedGroupKeys
    ).toEqual(['default:tools'])
  })

  it('serializes read-modify-write navigation mutations', async () => {
    const configStore = await loadConfigStore()

    await Promise.all(
      ['first', 'second'].map((id) =>
        configStore.mutateNavigationConfig((current) => ({
          navigation: {
            ...current,
            scenes: current.scenes.map((scene) =>
              scene.id === current.defaultSceneId
                ? {
                    ...scene,
                    quickRecords: [
                      ...scene.quickRecords,
                      {
                        id,
                        name: id,
                        primaryUrl: `https://${id}.example.com`,
                        createdAt: 1,
                        updatedAt: 1,
                      },
                    ],
                  }
                : scene
            ),
          },
          result: id,
        }))
      )
    )

    const navigation = await configStore.readNavigationConfig()
    expect(navigation.scenes[0].quickRecords.map((record) => record.id)).toEqual([
      'first',
      'second',
    ])
  })

  it('serializes app preference mutations and removes deleted group keys', async () => {
    const configStore = await loadConfigStore()
    const base = appConfigSchema.parse({
      navigation: {
        defaultSceneId: 'default',
        bookmarks: [],
        scenes: [
          {
            id: 'default',
            name: 'Default',
            groups: [
              { id: 'first', name: 'First', bookmarkIds: [] },
              { id: 'second', name: 'Second', bookmarkIds: [] },
            ],
          },
        ],
      },
    })
    await configStore.writeAppConfig(base)

    await Promise.all(
      ['default:first', 'default:second'].map((key) =>
        configStore.mutateAppConfig((current) => ({
          appConfig: {
            ...current,
            uiPreferences: {
              groupExpansion: {
                version: 1,
                expandedGroupKeys: [
                  ...(current.uiPreferences?.groupExpansion?.expandedGroupKeys ?? []),
                  key,
                ],
              },
            },
          },
          result: key,
        }))
      )
    )

    expect(
      (await configStore.readAppConfig()).uiPreferences?.groupExpansion?.expandedGroupKeys
    ).toEqual(['default:first', 'default:second'])

    await configStore.writeNavigationConfig({
      ...base.navigation,
      scenes: base.navigation.scenes.map((scene) => ({
        ...scene,
        groups: scene.groups.filter((group) => group.id !== 'first'),
      })),
    })

    expect(
      (await configStore.readAppConfig()).uiPreferences?.groupExpansion?.expandedGroupKeys
    ).toEqual(['default:second'])
  })
})
