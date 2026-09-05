import { useEffect, useState, type SetStateAction } from 'react'

/** Remote refreshes may replace clean fields, but never user input. */
export function useFieldDraft<T>(source: T, key: string) {
  const [state, setState] = useState({ key, base: source, value: source })
  const active = state.key === key ? state : { key, base: source, value: source }
  const dirty = JSON.stringify(active.value) !== JSON.stringify(active.base)
  useEffect(() => {
    if (state.key !== key || (!dirty && JSON.stringify(state.base) !== JSON.stringify(source))) {
      setState({ key, base: source, value: source })
    }
  }, [source, key, state, dirty])
  return {
    ...active,
    dirty,
    setValue: (next: SetStateAction<T>) =>
      setState((current) => ({
        ...current,
        value: typeof next === 'function' ? (next as (value: T) => T)(current.value) : next,
      })),
    accept: (base: T) => setState((current) => ({ ...current, base, value: base })),
    reset: () => setState({ key, base: source, value: source }),
  }
}
