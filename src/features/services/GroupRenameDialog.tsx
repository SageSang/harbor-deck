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
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
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
        className="w-full max-w-md overflow-hidden rounded-[1.25rem] border border-border/80 bg-background/98 shadow-[0_28px_72px_rgba(15,23,42,0.24)]"
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-2 text-primary">
              <Pencil className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-foreground">
                {messages.serviceGrid.editGroupTitle}
              </h2>
              <p id={descriptionId} className="mt-1 text-sm leading-5 text-muted-foreground">
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
            className="h-8 w-8 shrink-0 rounded-lg"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2 px-5 py-5">
          <label htmlFor={`${titleId}-name`} className="text-sm font-medium text-foreground">
            {messages.serviceGrid.groupNameLabel}
          </label>
          <Input
            ref={inputRef}
            id={`${titleId}-name`}
            value={name}
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-4">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
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
