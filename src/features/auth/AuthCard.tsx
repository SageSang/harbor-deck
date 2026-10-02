import { isLocalNewTab, openConnectionSettings } from '@/lib/clientRuntime'
import type { ReactNode } from 'react'
import { LockKeyhole } from 'lucide-react'

interface AuthCardProps {
  title: string
  description: string
  children: ReactNode
}

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center">
        <div className="w-full rounded-3xl border border-border/80 bg-background/95 p-6 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border border-border/80 bg-muted/35 p-2 text-primary">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">{title}</h1>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="mt-6">{children}</div>
          {isLocalNewTab() && (
            <button
              type="button"
              className="mt-4 text-sm underline"
              onClick={openConnectionSettings}
            >
              连接设置 / Connection settings
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
