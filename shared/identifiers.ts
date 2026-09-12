/** New identifiers fit every existing path route. Historical identifiers remain valid. */
export const MAX_NEW_ID_LENGTH = 256

export function buildUniqueIdentifier(base: string, occupied: Iterable<string>) {
  const used = new Set(occupied)
  const stem = base.slice(0, MAX_NEW_ID_LENGTH).replace(/-+$/, '') || 'item'
  if (!used.has(stem)) return stem
  for (let suffix = 2; ; suffix += 1) {
    const ending = `-${suffix}`
    const candidate = `${stem.slice(0, MAX_NEW_ID_LENGTH - ending.length).replace(/-+$/, '')}${ending}`
    if (!used.has(candidate)) return candidate
  }
}
