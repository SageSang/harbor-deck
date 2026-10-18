import dynamicIconImports from 'lucide-react/dynamicIconImports.js'
type DynamicIconName = keyof typeof dynamicIconImports

function toKebabCase(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
}

export function resolveDynamicIconName(iconName?: string): DynamicIconName | null {
  const normalized = iconName?.trim()
  if (!normalized) {
    return null
  }

  const candidates = new Set<string>([
    normalized,
    normalized.toLowerCase(),
    toKebabCase(normalized),
  ])

  for (const candidate of candidates) {
    if (candidate in dynamicIconImports) {
      return candidate as DynamicIconName
    }
  }

  return null
}
