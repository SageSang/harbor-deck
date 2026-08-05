// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
    const storedConfig = JSON.parse(
      await readFile(path.join(tempConfigDir, 'config.json'), 'utf8')
    )

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
})
