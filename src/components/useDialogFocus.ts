import { useEffect, useRef } from 'react'

const dialogs: Array<{ element: HTMLElement; priority: number }> = []
let originalOverflow = ''
const focusable =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
  priority = 90
) {
  const ref = useRef<T | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const element = ref.current
    if (!open || !element) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const entry = { element, priority }
    if (!dialogs.length) {
      originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    dialogs.push(entry)
    const isTop = () => [...dialogs].sort((a, b) => a.priority - b.priority).at(-1) === entry
    const items = () =>
      Array.from(element.querySelectorAll<HTMLElement>(focusable)).filter(
        (item) => !item.closest('[hidden], [inert]')
      )
    const focusFirst = () => (items()[0] ?? element).focus()
    if (!element.contains(document.activeElement)) focusFirst()
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeRef.current()
      } else if (event.key === 'Tab') {
        const targets = items()
        const first = targets[0] ?? element
        const last = targets.at(-1) ?? element
        if (
          !element.contains(document.activeElement) ||
          (event.shiftKey ? document.activeElement === first : document.activeElement === last)
        ) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
        }
      }
    }
    const onFocus = () => {
      if (isTop() && !element.contains(document.activeElement)) focusFirst()
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', onFocus)
    return () => {
      dialogs.splice(dialogs.indexOf(entry), 1)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocus)
      if (!dialogs.length) document.body.style.overflow = originalOverflow
      if (previous?.isConnected) previous.focus()
    }
  }, [open, priority])
  return ref
}
