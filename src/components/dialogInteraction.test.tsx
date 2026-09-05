import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDialogFocus } from './useDialogFocus'

afterEach(() => vi.unstubAllGlobals())
describe('dialog keyboard interaction', () => {
  it('keeps focus in the top dialog and closes one level per Escape', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const outerClosed = vi.fn()
    function Inner() {
      const [open, setOpen] = useState(true)
      const ref = useDialogFocus(open, () => setOpen(false), 130)
      return open ? (
        <div ref={ref} role="alertdialog" tabIndex={-1}>
          <button>Cancel</button>
          <button>Confirm</button>
        </div>
      ) : null
    }
    function Outer() {
      const ref = useDialogFocus(true, outerClosed)
      const [inner, setInner] = useState(false)
      return (
        <>
          <div ref={ref} role="dialog" tabIndex={-1}>
            <button onClick={() => setInner(true)}>Open child</button>
            <button>Last</button>
          </div>
          {inner && <Inner />}
        </>
      )
    }
    try {
      await act(async () => root.render(<Outer />))
      const trigger = host.querySelector('button')!
      await act(async () => trigger.click())
      expect(document.activeElement?.textContent).toBe('Cancel')
      await act(async () =>
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Tab',
            shiftKey: true,
            bubbles: true,
            cancelable: true,
          })
        )
      )
      expect(document.activeElement?.textContent).toBe('Confirm')
      await act(async () =>
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        )
      )
      expect(host.querySelector('[role="alertdialog"]')).toBeNull()
      expect(outerClosed).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(trigger)
      await act(async () =>
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        )
      )
      expect(outerClosed).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
