import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ConfirmOptions, ToastInput } from '@/features/feedback/feedbackContext'
import { FeedbackContext } from '@/features/feedback/feedbackContext'
import { getToastMeta } from '@/features/feedback/feedbackStyles'
import { useI18n } from '@/i18n/runtime'
import { cn } from '@/lib/utils'

interface ToastItem extends ToastInput {
  id: number
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { messages } = useI18n()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmation, setConfirmation] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)
  const toastIdRef = useRef(0)

  const showToast = useCallback((toast: ToastInput) => {
    const id = toastIdRef.current + 1
    toastIdRef.current = id

    setToasts((current) => [...current, { id, ...toast }])

    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 3200)
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => {
    if (resolverRef.current) {
      resolverRef.current(false)
      resolverRef.current = null
    }

    setConfirmation(options)

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const closeConfirmation = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed)
    resolverRef.current = null
    setConfirmation(null)
  }, [])

  useEffect(() => {
    if (!confirmation) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeConfirmation(false)
        return
      }

      if (
        event.key === 'Enter' &&
        confirmation.variant === 'destructive' &&
        !event.isComposing
      ) {
        event.preventDefault()
        closeConfirmation(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeConfirmation, confirmation])

  useEffect(() => {
    return () => {
      resolverRef.current?.(false)
      resolverRef.current = null
    }
  }, [])

  const value = useMemo(
    () => ({
      showToast,
      confirm,
    }),
    [confirm, showToast]
  )
  const toastMeta = useMemo(() => getToastMeta(messages), [messages])

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {createPortal(
        <>
          <div className="pointer-events-none fixed right-3 top-3 z-[120] flex w-[min(400px,calc(100vw-1.5rem))] flex-col gap-3 sm:right-4 sm:top-4 sm:w-[min(400px,calc(100vw-2rem))]">
            {toasts.map((toast) => {
              const meta = toastMeta[toast.type]
              const Icon = meta.icon

              return (
                <div
                  key={toast.id}
                  className={cn(
                    'pointer-events-auto relative overflow-hidden rounded-[1.35rem] border shadow-[0_24px_56px_rgba(15,23,42,0.18)] backdrop-blur-xl',
                    meta.containerClass
                  )}
                >
                  <div className={cn('absolute inset-y-0 left-0 w-1.5', meta.accentClass)} />
                  <div className="flex items-start gap-3 px-4 py-3.5 pl-5">
                    <div
                      className={cn(
                        'mt-0.5 shrink-0 rounded-full p-1.5 shadow-sm',
                        meta.iconWrapperClass
                      )}
                    >
                      <Icon className={cn('h-4.5 w-4.5', meta.iconClass)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          'text-xs font-semibold uppercase tracking-[0.18em]',
                          meta.titleClass
                        )}
                      >
                        {meta.title}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-100/95">
                        {toast.message}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={messages.common.closeToast}
                      onClick={() => {
                        setToasts((current) => current.filter((item) => item.id !== toast.id))
                      }}
                      className="shrink-0 rounded-md p-1 text-slate-500 opacity-80 transition hover:bg-slate-900/5 hover:text-slate-700 hover:opacity-100 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {confirmation && (
            <div
              className="fixed inset-0 z-[130] bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.14),transparent_18%),rgba(2,6,23,0.62)] p-4 backdrop-blur-sm"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closeConfirmation(false)
                }
              }}
            >
              <div
                className="mx-auto mt-24 w-full max-w-md rounded-[1.6rem] border border-border/80 bg-background/96 shadow-[0_30px_80px_rgba(15,23,42,0.2)] backdrop-blur-xl dark:bg-background/92"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-start gap-3 border-b border-border/70 px-5 py-4">
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-2 text-rose-600 dark:text-rose-300">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-foreground">
                      {confirmation.title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {confirmation.message}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2 px-5 py-4">
                  <Button type="button" variant="outline" onClick={() => closeConfirmation(false)}>
                    {confirmation.cancelLabel ?? messages.common.cancel}
                  </Button>
                  <Button
                    type="button"
                    variant={confirmation.variant === 'destructive' ? 'destructive' : 'default'}
                    onClick={() => closeConfirmation(true)}
                  >
                    {confirmation.confirmLabel ?? messages.common.confirm}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>,
        document.body
      )}
    </FeedbackContext.Provider>
  )
}
