import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dismissSearchBootShell,
  getSearchBootState,
  SEARCH_BOOT_INPUT_EVENT,
  SEARCH_BOOT_INPUT_ID,
  SEARCH_BOOT_SHELL_ID,
} from './components/searchBoot'

async function runSearchBootScript() {
  const html = await readFile(path.resolve('index.html'), 'utf8')
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const script = parsed.getElementById('harbordeck-search-boot-script')?.textContent
  if (!script) throw new Error('Search boot script is missing from index.html')
  window.eval(script)
}

describe('search boot handoff', () => {
  beforeEach(() => {
    vi.resetModules()
    window.history.replaceState(null, '', '/')
    delete window.__harborDeckSearchBoot
    document.body.innerHTML = `
      <section id="${SEARCH_BOOT_SHELL_ID}">
        <input id="${SEARCH_BOOT_INPUT_ID}" />
      </section>
    `
  })

  afterEach(() => {
    delete window.__harborDeckSearchBoot
    document.body.innerHTML = ''
  })

  it('restores the extension query and keeps later input in the boot state', async () => {
    window.history.replaceState(
      null,
      '',
      '/?embedded=1&harbordeckQuery=first%20query'
    )
    const inputEvent = vi.fn()
    window.addEventListener(SEARCH_BOOT_INPUT_EVENT, inputEvent)

    await runSearchBootScript()

    const input = document.getElementById(SEARCH_BOOT_INPUT_ID) as HTMLInputElement
    expect(input.value).toBe('first query')
    expect(window.location.search).toBe('?embedded=1')
    expect(getSearchBootState()).toMatchObject({
      value: 'first query',
      revision: 0,
      pendingSubmit: false,
    })

    input.value = 'first query continued'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    expect(getSearchBootState()).toMatchObject({
      value: 'first query continued',
      revision: 1,
    })
    expect(inputEvent).toHaveBeenCalledOnce()
    window.removeEventListener(SEARCH_BOOT_INPUT_EVENT, inputEvent)
  })

  it('queues Enter until the full search box is ready', async () => {
    await runSearchBootScript()
    const input = document.getElementById(SEARCH_BOOT_INPUT_ID) as HTMLInputElement
    input.value = 'queued search'

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(getSearchBootState()).toMatchObject({
      value: 'queued search',
      pendingSubmit: true,
    })
  })

  it('removes the boot shell only when the application takes over', async () => {
    await runSearchBootScript()
    dismissSearchBootShell()

    expect(document.getElementById(SEARCH_BOOT_SHELL_ID)).toBeNull()
    expect(getSearchBootState()?.released).toBe(true)
  })
})
