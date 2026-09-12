// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

let directory: string
let app: FastifyInstance | undefined
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'harbor-startup-'))
  vi.stubEnv('CONFIG_DIR', directory)
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('HARBORDECK_TRUSTED_EXTENSION_IDS', '')
  vi.resetModules()
})
afterEach(async () => {
  await app?.close()
  app = undefined
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})

describe('service startup and embedding boundaries', () => {
  it('serves health while remote scheduling stalls, and closes by cancelling the body', async () => {
    await writeFile(
      path.join(directory, 'config.json'),
      JSON.stringify({
        system: {
          webdavBackup: {
            url: 'https://fixture.invalid/dav',
            username: 'fixture',
            password: 'fixture',
            remotePath: '',
            autoBackup: true,
          },
        },
      })
    )
    let started!: () => void
    const reading = new Promise<void>((resolve) => {
      started = resolve
    })
    const cancel = vi.fn()
    const remoteFetch = vi.fn(async () => {
      started()
      return new Response(new ReadableStream({ cancel }), { status: 207 })
    })
    vi.stubGlobal('fetch', remoteFetch)
    const { buildServer } = await import('./app')
    app = await buildServer()
    app.log.level = 'silent'
    expect(remoteFetch).not.toHaveBeenCalled()
    await app.listen({ port: 0, host: '127.0.0.1' })
    await reading
    expect((await app.inject('/api/health')).statusCode).toBe(200)
    await app.close()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('only permits exact configured extensions on embedded HTML entry points', async () => {
    const trusted = 'a'.repeat(32)
    vi.stubEnv('HARBORDECK_TRUSTED_EXTENSION_IDS', trusted)
    const { buildServer } = await import('./app')
    app = await buildServer()
    app.log.level = 'silent'
    app.get('/', async (_request, reply) => reply.type('text/html').send('<!doctype html>fixture'))
    const embedded = await app.inject('/?embedded=1')
    expect(embedded.headers['content-security-policy']).toContain(
      `frame-ancestors chrome-extension://${trusted}`
    )
    expect(embedded.headers['content-security-policy']).not.toContain('chrome-extension://*')
    expect(embedded.headers['x-frame-options']).toBe('DENY')
    expect((await app.inject('/')).headers['content-security-policy']).toContain(
      "frame-ancestors 'none'"
    )
    expect(
      (await app.inject('/api/health?embedded=1')).headers['content-security-policy']
    ).toContain("frame-ancestors 'none'")
  })

  it('does not grant embedding from the query flag alone and rejects wildcard configuration', async () => {
    const { buildServer } = await import('./app')
    app = await buildServer()
    app.log.level = 'silent'
    app.get('/', async (_request, reply) => reply.type('text/html').send('fixture'))
    expect((await app.inject('/?embedded=1')).headers['content-security-policy']).toContain(
      "frame-ancestors 'none'"
    )
    vi.stubEnv('HARBORDECK_TRUSTED_EXTENSION_IDS', '*')
    await expect(buildServer()).rejects.toThrow('有效 Chrome 扩展 ID')
  })
})
