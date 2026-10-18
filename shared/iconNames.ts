import dynamicIconImports from 'lucide-react/dynamicIconImports.js'
type DynamicIconName = keyof typeof dynamicIconImports

/** Keep display labels compatible with the labels stored by older icon pickers. */
export function toPascalCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

const legacyIconNames = new Map<string, DynamicIconName | null>()
for (const key of Object.keys(dynamicIconImports) as DynamicIconName[]) {
  const label = toPascalCase(key).toLowerCase()
  // A future catalog may give two icons the same label. Never guess which was stored.
  legacyIconNames.set(label, legacyIconNames.has(label) ? null : key)
}

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

  if (Object.prototype.hasOwnProperty.call(dynamicIconImports, normalized)) {
    return normalized as DynamicIconName
  }

  const legacyName = legacyIconNames.get(normalized.toLowerCase())
  // null also returns here: heuristic normalization must not bypass an ambiguous label.
  if (legacyName !== undefined) return legacyName

  const candidates = new Set<string>([normalized.toLowerCase(), toKebabCase(normalized)])

  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(dynamicIconImports, candidate)) {
      return candidate as DynamicIconName
    }
  }

  return null
}
