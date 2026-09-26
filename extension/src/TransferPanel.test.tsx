import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TransferPanel } from './TransferPanel'
import { defaultSettings } from './storage'
const request = vi.hoisted(() => vi.fn())
vi.mock('./transferClient', () => ({
  transferRequest: request,
  MAX_TRANSFER_BYTES: 5 * 1024 * 1024,
}))
let root: Root
let host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  request.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
it('reports import completion in the language actually imported', async () => {
  const onImported = vi.fn()
  request.mockResolvedValue({
    settings: defaultSettings,
    language: 'en',
    languageApplied: true,
    tokenOmitted: true,
    draftCount: 2,
  })
  await act(async () =>
    root.render(
      <TransferPanel
        language="zh-CN"
        disabled={false}
        hasUnsavedChanges={false}
        onBusy={vi.fn()}
        onImported={onImported}
      />
    )
  )
  const input = host.querySelector('input')!
  Object.defineProperty(input, 'files', { value: [{ size: 10, text: async () => '{}' }] })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  expect(onImported).toHaveBeenCalledOnce()
  expect(host.querySelector('[role=status]')?.textContent).toContain('2 drafts imported')
  expect(host.querySelector('[role=status]')?.textContent).toContain('re-enter the token')
})
it('protects unsaved form edits even when a previously opened file picker returns', async () => {
  await act(async () =>
    root.render(
      <TransferPanel
        language="en"
        disabled={false}
        hasUnsavedChanges={true}
        onBusy={vi.fn()}
        onImported={vi.fn()}
      />
    )
  )
  const input = host.querySelector('input')!
  Object.defineProperty(input, 'files', { value: [{ size: 10, text: async () => '{}' }] })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  expect(request).not.toHaveBeenCalled()
  expect((host.querySelectorAll('button')[1] as HTMLButtonElement).disabled).toBe(true)
})
