import { useDialogFocus } from './useDialogFocus'
import { useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/runtime'
import { cn } from '@/lib/utils'

interface ModalShellProps {
  open: boolean
  title: string
  description?: string
  icon: LucideIcon
  widthClassName?: string
  onClose: () => void
  children: ReactNode
}

export function ModalShell({
  open,
  title,
  description,
  icon: Icon,
  widthClassName,
  onClose,
  children,
}: ModalShellProps) {
  const { messages } = useI18n()

  const dialogRef = useDialogFocus(open, onClose)
  const titleId = useId()

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[90] overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(242,139,88,0.16),transparent_28%),rgba(20,18,16,0.56)] p-1.5 backdrop-blur-md sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className="pointer-events-none flex min-h-[calc(100dvh-1rem)] items-start sm:min-h-[calc(100dvh-2rem)] sm:items-center"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onClose()
          }
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={cn(
            'pointer-events-auto relative mx-auto flex max-h-[calc(100dvh-1rem)] min-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[1.65rem] border border-border/80 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.9))] shadow-[0_34px_90px_rgba(109,74,49,0.18)] backdrop-blur-2xl sm:max-h-[calc(100dvh-2rem)] sm:min-h-[calc(100dvh-2rem)] sm:rounded-[1.9rem] md:min-h-0 dark:shadow-[0_34px_86px_rgba(0,0,0,0.4)]',
            widthClassName
          )}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-5 top-0 h-24 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.14),transparent_72%)] blur-2xl sm:inset-x-6"
          />

          <div className="relative flex items-start justify-between gap-2.5 border-b border-border/65 bg-[linear-gradient(180deg,hsl(var(--background)/0.8),hsl(var(--background)/0.62))] px-3.5 py-3 backdrop-blur-sm sm:gap-3 sm:px-5 sm:py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="rounded-[1rem] border border-primary/15 bg-primary/10 p-1.5 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] sm:rounded-2xl sm:p-2">
                  <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                </div>
                <div className="min-w-0">
                  <h2
                    id={titleId}
                    className="truncate text-[15px] font-semibold tracking-tight text-foreground sm:text-base"
                  >
                    {title}
                  </h2>
                  {description && (
                    <p className="mt-0.5 text-[11px] leading-[1.35rem] text-muted-foreground sm:text-xs sm:leading-5">
                      {description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={messages.common.closeModal}
              onClick={onClose}
              className="h-8 w-8 shrink-0 rounded-lg"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  )
}
