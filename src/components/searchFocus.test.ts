import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let focus: typeof import('./searchFocus')
let listeners: Array<
  [string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined]
>
beforeEach(async () => {
  vi.resetModules()
  document.body.innerHTML = '<input id="search-box-input" value="keep query"><input id="editor">'
  listeners = []
  const add = window.addEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation((name, listener, options) => {
    listeners.push([name, listener, options])
    add(name, listener, options)
  })
  focus = await import('./searchFocus')
  focus.installSearchFocusGuard()
})
afterEach(() => {
  for (const [name, listener, options] of listeners)
    window.removeEventListener(name, listener, options)
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})
describe('initial search focus protection', () => {
  it('focuses the initial input without changing its text or selection', () => {
    const input = document.querySelector('input')!
    input.setSelectionRange(2, 4)
    expect(focus.focusSearchInputIfSafe()).toBe(true)
    expect(document.activeElement).toBe(input)
    expect([input.value, input.selectionStart, input.selectionEnd]).toEqual(['keep query', 2, 4])
  })
  it('keeps an already focused editor in control', () => {
    document.getElementById('editor')!.focus()
    expect(focus.focusSearchInputIfSafe()).toBe(false)
    expect(document.activeElement?.id).toBe('editor')
  })
  it.each(['pointerdown', 'keydown', 'input', 'compositionstart', 'blur'])(
    'does not steal focus after %s even if the active element has disappeared',
    (event) => {
      window.dispatchEvent(new Event(event))
      expect(focus.focusSearchInputIfSafe()).toBe(false)
      expect(document.activeElement).toBe(document.body)
    }
  )
  it('can focus the transition input while the full app is loading', () => {
    document.body.innerHTML = '<input id="boot">'
    expect(focus.focusSearchInputIfSafe('boot')).toBe(true)
    expect(document.activeElement?.id).toBe('boot')
  })
})
