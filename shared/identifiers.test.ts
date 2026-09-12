import { describe, expect, it } from 'vitest'
import { buildUniqueIdentifier } from './identifiers'
import { buildUniqueNavigationId } from '../src/features/navigation/navigationConfig'
import { buildUniqueSlug } from '../src/features/services/servicesConfig'

describe('new identifier bounds', () => {
  it('leaves room for collision suffixes and preserves short identifiers', () => {
    const base = 'a'.repeat(4096)
    const occupied = [buildUniqueIdentifier(base, [])]
    for (let index = 0; index < 12; index += 1) occupied.push(buildUniqueIdentifier(base, occupied))
    expect(new Set(occupied).size).toBe(occupied.length)
    expect(occupied.every((id) => id.length <= 256 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))).toBe(
      true
    )
    expect(buildUniqueIdentifier('hello', ['hello'])).toBe('hello-2')
  })
  it('applies the same bound in navigation and legacy browser import generators', () => {
    expect(buildUniqueNavigationId('Word '.repeat(200), [], 'bookmark').length).toBeLessThanOrEqual(
      256
    )
    expect(buildUniqueSlug('标题'.repeat(200), []).length).toBeLessThanOrEqual(256)
    expect(buildUniqueNavigationId('Hello World', [], 'bookmark')).toBe('hello-world')
  })
})
