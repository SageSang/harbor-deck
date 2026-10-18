import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { createSettingsCoordinator } from './settingsCoordinator'
import { STORAGE_KEY, defaultSettings } from './storage'
import { OptionsApp } from './options'
vi.mock('./network', () => ({
  hasOriginPermission: async () => true,
  requestOriginPermissions: async () => true,
}))
vi.mock('./resolutionClient', () => ({ requestResolution: async () => ({}) }))
vi.mock('./theme', () => ({ restoreExtensionTheme: async () => {} }))
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})
it('keeps a stale options form after a conflict and reloads only when explicitly requested', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let tail = Promise.resolve<unknown>(undefined)
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_: string, work: () => Promise<unknown>) => {
        const next = tail.then(work)
        tail = next.catch(() => undefined)
        return next
      },
    },
  })
  const values: Record<string, unknown> = {
    [STORAGE_KEY]: {
      ...defaultSettings,
      primaryUrl: 'https://old.test/',
      apiToken: 'old-fixture-token',
      settingsRevision: 'r1',
    },
  }
  const area = {
    get: async (keys: string | string[]) =>
      Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((k) => [k, values[k]])),
    set: async (data: Record<string, unknown>) => {
      Object.assign(values, data)
    },
  }
  const worker = createSettingsCoordinator()
  vi.stubGlobal('chrome', {
    storage: { local: area, sync: area },
    runtime: {
      sendMessage: async (request: {
        operation: string
        settings: Parameters<typeof worker.save>[0]
      }) => {
        try {
          return {
            ok: true,
            settings:
              request.operation === 'save'
                ? await worker.save(request.settings)
                : await worker.read(),
          }
        } catch {
          return { ok: false, error: 'settings-conflict' }
        }
      },
    },
  })
  const hosts = [document.createElement('div'), document.createElement('div')]
  hosts.forEach((h) => document.body.append(h))
  const roots = hosts.map((h) => createRoot(h))
  const change = async (host: HTMLElement, selector: string, value: string) => {
    await act(async () => {
      const input = host.querySelector(selector) as HTMLInputElement
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const submit = async (host: HTMLElement) =>
    act(async () => {
      host
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
  try {
    for (const root of roots) await act(async () => root.render(<OptionsApp />))
    await change(hosts[0], 'input[id="primary-url"]', 'https://new.test/')
    await submit(hosts[0])
    const saved = structuredClone(values[STORAGE_KEY])
    await change(hosts[1], 'input[id="primary-url"]', 'https://stale-edit.test/')
    await submit(hosts[1])
    expect(values[STORAGE_KEY]).toEqual(saved)
    expect((hosts[1].querySelector('input[id="primary-url"]') as HTMLInputElement).value).toBe(
      'https://stale-edit.test/'
    )
    expect(hosts[1].textContent).toContain('Another page changed')
    const reload = Array.from(hosts[1].querySelectorAll('button')).find(
      (b) => b.textContent === 'Discard edits and reload'
    )!
    await act(async () => reload.click())
    expect((hosts[1].querySelector('input[id="primary-url"]') as HTMLInputElement).value).toBe(
      'https://new.test/'
    )
  } finally {
    for (const root of roots) await act(async () => root.unmount())
  }
})
