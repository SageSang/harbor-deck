export const SEARCH_KEYWORD_PLACEHOLDER = '{keyword}'

export interface SearchEngineConfig {
  id: string
  name: string
  urlTemplate: string
}

export interface SearchEngineOption extends SearchEngineConfig {
  builtIn: boolean
}

export const builtinSearchEngines: SearchEngineOption[] = [
  {
    id: 'google',
    name: 'Google',
    urlTemplate: `https://www.google.com/search?q=${SEARCH_KEYWORD_PLACEHOLDER}`,
    builtIn: true,
  },
  {
    id: 'bing',
    name: 'Bing',
    urlTemplate: `https://www.bing.com/search?q=${SEARCH_KEYWORD_PLACEHOLDER}`,
    builtIn: true,
  },
  {
    id: 'baidu',
    name: '百度',
    urlTemplate: `https://www.baidu.com/s?wd=${SEARCH_KEYWORD_PLACEHOLDER}`,
    builtIn: true,
  },
]

export const builtinSearchEngineIds = builtinSearchEngines.map((engine) => engine.id)

export function isValidSearchEngineTemplate(urlTemplate: string) {
  const template = urlTemplate.trim()

  if (!template.includes(SEARCH_KEYWORD_PLACEHOLDER)) {
    return false
  }

  try {
    const parsed = new URL(template.split(SEARCH_KEYWORD_PLACEHOLDER).join('keyword'))
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function getSearchEngines(customSearchEngines: readonly SearchEngineConfig[] = []) {
  return [
    ...builtinSearchEngines,
    ...customSearchEngines.map((engine) => ({
      ...engine,
      builtIn: false,
    })),
  ]
}

export function getDefaultSearchEngine(
  defaultSearchEngineId: string,
  customSearchEngines: readonly SearchEngineConfig[] = []
) {
  const availableEngines = getSearchEngines(customSearchEngines)

  return (
    availableEngines.find((engine) => engine.id === defaultSearchEngineId) ??
    builtinSearchEngines[0]
  )
}

export function buildSearchUrl(engine: SearchEngineConfig, keyword: string) {
  return engine.urlTemplate.split(SEARCH_KEYWORD_PLACEHOLDER).join(encodeURIComponent(keyword))
}

export function createSearchEngineId(name: string, existingIds: Iterable<string>) {
  const normalized = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const baseId = normalized || 'custom-search'
  const occupiedIds = new Set(existingIds)

  if (!occupiedIds.has(baseId)) {
    return baseId
  }

  let suffix = 2
  let candidateId = `${baseId}-${suffix}`

  while (occupiedIds.has(candidateId)) {
    suffix += 1
    candidateId = `${baseId}-${suffix}`
  }

  return candidateId
}
