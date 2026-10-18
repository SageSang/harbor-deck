// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('lucide-react/dynamicIconImports.js')
  vi.resetModules()
})

it.each([
  ['building-2', 'building2'],
  ['building2', 'building-2'],
])('rejects ambiguous historical labels regardless of catalog order: %s, %s', async (...keys) => {
  vi.resetModules()
  vi.doMock('lucide-react/dynamicIconImports.js', () => ({
    default: Object.assign(
      Object.create({ 'inherited-icon': vi.fn() }),
      Object.fromEntries(keys.map((key) => [key, vi.fn()]))
    ),
  }))
  const { resolveDynamicIconName } = await import('./iconNames')
  for (const key of keys) expect(resolveDynamicIconName(key)).toBe(key)
  for (const label of ['Building2', 'BUILDING2', ' Building2 ']) {
    expect(resolveDynamicIconName(label)).toBeNull()
  }
  // Explicit keys and separators still identify their original icon.
  expect(resolveDynamicIconName(' building2 ')).toBe('building2')
  expect(resolveDynamicIconName('BUILDING-2')).toBe('building-2')
  expect(resolveDynamicIconName('building_2')).toBe('building-2')
  for (const name of ['constructor', '__proto__', 'toString', 'inherited-icon', 'InheritedIcon']) {
    expect(resolveDynamicIconName(name)).toBeNull()
  }
})
