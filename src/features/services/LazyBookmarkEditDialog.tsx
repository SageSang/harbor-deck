import { useEffect, useState, type ComponentType } from 'react'
import type { NavigationConfig } from '@/config/schema'

interface BookmarkEditDialogProps {
  open: boolean
  config?: NavigationConfig
  serviceSlug: string | null
  mode?: 'edit' | 'duplicate'
  onClose: () => void
}

let bookmarkEditDialogPromise: Promise<ComponentType<BookmarkEditDialogProps>> | null = null

function loadBookmarkEditDialog() {
  if (!bookmarkEditDialogPromise) {
    bookmarkEditDialogPromise = import('./BookmarkEditDialog').then(
      (module) => module.BookmarkEditDialog
    )
  }

  return bookmarkEditDialogPromise
}

export function LazyBookmarkEditDialog(props: BookmarkEditDialogProps) {
  const [LoadedComponent, setLoadedComponent] =
    useState<ComponentType<BookmarkEditDialogProps> | null>(null)

  useEffect(() => {
    if (!props.open || LoadedComponent) {
      return
    }

    let cancelled = false

    void loadBookmarkEditDialog().then((component) => {
      if (!cancelled) {
        setLoadedComponent(() => component)
      }
    })

    return () => {
      cancelled = true
    }
  }, [LoadedComponent, props.open])

  if (!props.open || !LoadedComponent) {
    return null
  }

  return <LoadedComponent {...props} />
}
