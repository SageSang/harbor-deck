import { useEffect, useState } from 'react'

/** A form and its concurrency token always come from the same read. */
export function useEditSnapshot<T>(open: boolean, key: string, source: T | undefined) {
  const [saved, setSaved] = useState<{ key: string; data: T } | null>(null)
  useEffect(() => {
    if (!open) setSaved(null)
    else if (source !== undefined && (!saved || saved.key !== key)) {
      setSaved({ key, data: source })
    }
  }, [open, key, source, saved])
  const snapshot = saved?.key === key ? saved.data : source
  return {
    snapshot,
    changed:
      source !== undefined &&
      snapshot !== undefined &&
      JSON.stringify(source) !== JSON.stringify(snapshot),
    reload: (next = source) => {
      if (next !== undefined) setSaved({ key, data: next })
    },
  }
}
