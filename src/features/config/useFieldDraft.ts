import { useEffect, useMemo, useRef, useState, type SetStateAction } from 'react'

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

interface FieldDrafts<T> {
  key: string
  base: Record<string, T>
  value: Record<string, T>
  latest: Record<string, T>
}

function reconcile<T>(
  state: FieldDrafts<T>,
  key: string,
  source: Record<string, T>
): FieldDrafts<T> {
  if (state.key !== key) return { key, base: source, value: source, latest: source }
  if (equal(state.latest, source)) return state

  const base = { ...state.base }
  const value = { ...state.value }
  const fields = new Set([...Object.keys(state.latest), ...Object.keys(source)])
  fields.forEach((field) => {
    if (equal(state.latest[field], source[field]) || !equal(value[field], base[field])) return
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      base[field] = source[field]
      value[field] = source[field]
    } else {
      delete base[field]
      delete value[field]
    }
  })
  return { key, base, value, latest: source }
}

/** Reconcile each field independently, keeping changed/deleted remote fields inspectable. */
export function useFieldDrafts<T>(source: Record<string, T>, key: string) {
  const [state, setState] = useState<FieldDrafts<T>>({
    key,
    base: source,
    value: source,
    latest: source,
  })
  const latestRef = useRef({ key, source })
  latestRef.current = { key, source }
  const active = reconcile(state, key, source)
  useEffect(() => setState((current) => reconcile(current, key, source)), [source, key])

  const dirtyFields = Object.keys(active.value).filter(
    (field) => !equal(active.value[field], active.base[field])
  )
  // An acknowledged save can itself have been superseded by a later server read.
  // Keep that conflict visible even if the input still equals the saved value.
  const changedFields = Object.keys(active.base).filter(
    (field) => !equal(active.base[field], source[field])
  )

  return {
    ...active,
    dirty: dirtyFields.length > 0,
    dirtyFields,
    changed: changedFields.length > 0,
    changedFields,
    setValue: (next: SetStateAction<Record<string, T>>) =>
      setState((current) => {
        const latest = latestRef.current
        if (latest.key !== key) return current
        const ready = reconcile(current, key, latest.source)
        return { ...ready, value: typeof next === 'function' ? next(ready.value) : next }
      }),
    acceptField: (field: string, submittedValue: T, savedValue: T) =>
      setState((current) => {
        const latest = latestRef.current
        if (latest.key !== key) return current
        const ready = reconcile(current, key, latest.source)
        return {
          ...ready,
          base: { ...ready.base, [field]: savedValue },
          value: equal(ready.value[field], submittedValue)
            ? { ...ready.value, [field]: savedValue }
            : ready.value,
        }
      }),
    reset: (field?: string) =>
      setState((current) => {
        const latest = latestRef.current
        if (latest.key !== key) return current
        if (field === undefined)
          return { key, base: latest.source, value: latest.source, latest: latest.source }
        const ready = reconcile(current, key, latest.source)
        const base = { ...ready.base }
        const value = { ...ready.value }
        if (Object.prototype.hasOwnProperty.call(latest.source, field)) {
          base[field] = latest.source[field]
          value[field] = latest.source[field]
        } else {
          delete base[field]
          delete value[field]
        }
        return { ...ready, base, value }
      }),
  }
}

/** Single-field form using the same submitted-value protection as grouped fields. */
export function useFieldDraft<T>(source: T, key: string) {
  const fields = useMemo(() => ({ value: source }), [source])
  const editor = useFieldDrafts(fields, key)
  return {
    key,
    base: editor.base.value,
    value: editor.value.value,
    dirty: editor.dirty,
    changed: editor.changed,
    setValue: (next: SetStateAction<T>) =>
      editor.setValue((current) => ({
        value: typeof next === 'function' ? (next as (value: T) => T)(current.value) : next,
      })),
    accept: (submittedValue: T, savedValue: T) =>
      editor.acceptField('value', submittedValue, savedValue),
    reset: () => editor.reset(),
  }
}
