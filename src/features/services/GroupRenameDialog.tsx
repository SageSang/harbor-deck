import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Pencil, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n/runtime'

interface GroupRenameDialogProps {
  open: boolean
  currentName: string
  saving: boolean
  onClose: () => void
  onSave: (name: string) => void
}

export function GroupRenameDialog({
  open,
  currentName,
  saving,
  onClose,
  onSave,
}: GroupRenameDialogProps) {
  const { messages } = useI18n()
  const [name, setName] = useState(currentName)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) {
      return
    }

    setName(currentName)
    const focusTimer = window.setTimeout(() => inputRef.current?.select(), 0)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [currentName, open])

  if (!open) {
    return null
  }

  const trimmedName = name.trim()

  function saveName() {
    if (!trimmedName || trimmedName === currentName.trim() || saving) {
      return
    }
    onSave(trimmedName)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    saveName()
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
      return
    }
    event.preventDefault()
    saveName()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-stone-950/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onClose()
        }
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md overflow-hidden rounded-[1.25rem] border border-stone-200 bg-stone-50 text-stone-900 shadow-[0_28px_72px_rgba(15,23,42,0.32)] ring-1 ring-black/5 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-50 dark:ring-white/10"
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 bg-white px-5 py-4 dark:border-stone-800 dark:bg-stone-950">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-2 text-orange-600 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-300">
              <Pencil className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-stone-950 dark:text-white">
                {messages.serviceGrid.editGroupTitle}
              </h2>
              <p
                id={descriptionId}
                className="mt-1 text-sm leading-5 text-stone-600 dark:text-stone-300"
              >
                {messages.serviceGrid.editGroupDescription}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={messages.common.closeModal}
            disabled={saving}
            onClick={onClose}
            className="h-8 w-8 shrink-0 rounded-lg text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2 bg-stone-50 px-5 py-5 dark:bg-stone-950">
          <label
            htmlFor={`${titleId}-name`}
            className="text-sm font-medium text-stone-800 dark:text-stone-200"
          >
            {messages.serviceGrid.groupNameLabel}
          </label>
          <Input
            ref={inputRef}
            id={`${titleId}-name`}
            value={name}
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={handleInputKeyDown}
            className="border-stone-300 bg-white text-stone-950 shadow-sm placeholder:text-stone-400 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 dark:border-stone-700 dark:bg-stone-900 dark:text-white dark:placeholder:text-stone-500"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-stone-200 bg-white px-5 py-4 dark:border-stone-800 dark:bg-stone-950">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
            className="border-stone-300 bg-white text-stone-800 hover:border-stone-400 hover:bg-stone-100 hover:text-stone-950 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:border-stone-600 dark:hover:bg-stone-800 dark:hover:text-white"
          >
            {messages.common.cancel}
          </Button>
          <Button
            type="submit"
            disabled={!trimmedName || trimmedName === currentName.trim() || saving}
          >
            {messages.serviceGrid.saveGroupAction}
          </Button>
        </div>
      </form>
    </div>,
    document.body
  )
}
