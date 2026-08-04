import { createContext } from 'react'

export interface ToastInput {
  type: 'success' | 'warning' | 'error'
  message: string
}

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
}

export interface FeedbackContextValue {
  showToast: (toast: ToastInput) => void
  clearToasts: () => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

export const FeedbackContext = createContext<FeedbackContextValue | null>(null)
