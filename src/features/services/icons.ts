import dynamicIconImports from 'lucide-react/dynamicIconImports.js'
import {
  serviceIconCategoryAliases,
  serviceIconCategoryOrder,
  serviceIconManualAliases,
  serviceIconManualCategories,
  serviceIconTokenAliases,
  serviceIconTokenCategories,
} from '@/features/services/iconSearchMeta'
import type { ServiceIconCategoryKey } from '@/features/services/iconSearchMeta'

type DynamicIconName = keyof typeof dynamicIconImports

export { serviceIconCategoryOrder }
export type { ServiceIconCategoryKey }

export interface ServiceIconOption {
  label: string
  loaderKey: DynamicIconName
  categories: ServiceIconCategoryKey[]
  categoryAliases: string[]
  manualAliases: string[]
  tokenAliases: string[]
  searchText: string
}

export function toPascalCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

export { resolveDynamicIconName } from '../../../shared/iconNames'

export function loadServiceIcon(loaderKey: DynamicIconName) {
  return dynamicIconImports[loaderKey]()
}

function normalizeSearchTerm(value: string) {
  return value.trim().toLowerCase()
}

function compactSearchTerm(value: string) {
  return normalizeSearchTerm(value).replace(/[\s_-]+/g, '')
}

function uniqueSearchTerms(values: readonly string[]) {
  return Array.from(new Set(values.map(normalizeSearchTerm).filter(Boolean)))
}

function buildIconTokenAliases(loaderKey: DynamicIconName) {
  const tokens = loaderKey.split('-')

  return uniqueSearchTerms(tokens.flatMap((token) => serviceIconTokenAliases[token] ?? []))
}

function buildIconTokenCategories(loaderKey: DynamicIconName) {
  const tokens = loaderKey.split('-')

  return Array.from(
    new Set(tokens.flatMap((token) => serviceIconTokenCategories[token] ?? []))
  ) as ServiceIconCategoryKey[]
}

function buildIconManualAliases(loaderKey: DynamicIconName) {
  return uniqueSearchTerms(serviceIconManualAliases[loaderKey] ?? [])
}

function buildIconManualCategories(loaderKey: DynamicIconName) {
  return Array.from(
    new Set(serviceIconManualCategories[loaderKey] ?? [])
  ) as ServiceIconCategoryKey[]
}

function buildIconCategories(loaderKey: DynamicIconName) {
  return Array.from(
    new Set([...buildIconTokenCategories(loaderKey), ...buildIconManualCategories(loaderKey)])
  ) as ServiceIconCategoryKey[]
}

function buildCategoryAliases(categories: readonly ServiceIconCategoryKey[]) {
  return uniqueSearchTerms(
    categories.flatMap((category) => serviceIconCategoryAliases[category] ?? [])
  )
}

function buildIconSearchText(
  loaderKey: DynamicIconName,
  label: string,
  aliases: readonly string[]
) {
  return uniqueSearchTerms([
    label,
    loaderKey,
    loaderKey.replace(/-/g, ' '),
    loaderKey.replace(/-/g, ''),
    ...aliases,
  ]).join(' ')
}

function getMatchScore(
  term: string,
  keyword: string,
  compactKeyword: string,
  exactScore: number,
  prefixScore: number,
  includesScore: number
) {
  const compactTerm = compactSearchTerm(term)

  if (term === keyword || compactTerm === compactKeyword) {
    return exactScore
  }

  if (term.startsWith(keyword) || compactTerm.startsWith(compactKeyword)) {
    return prefixScore
  }

  if (term.includes(keyword) || compactTerm.includes(compactKeyword)) {
    return includesScore
  }

  return 0
}

function getSearchScore(option: ServiceIconOption, keyword: string) {
  const compactKeyword = compactSearchTerm(keyword)
  if (!compactKeyword) {
    return 0
  }

  const label = option.label.toLowerCase()
  const loaderKey = option.loaderKey
  const spacedLoaderKey = loaderKey.replace(/-/g, ' ')

  const baseScore = Math.max(
    getMatchScore(loaderKey, keyword, compactKeyword, 1200, 920, 680),
    getMatchScore(spacedLoaderKey, keyword, compactKeyword, 1160, 900, 660),
    getMatchScore(label, keyword, compactKeyword, 1120, 880, 640)
  )

  const manualAliasScore = option.manualAliases.reduce(
    (best, term) => Math.max(best, getMatchScore(term, keyword, compactKeyword, 980, 760, 560)),
    0
  )

  const tokenAliasScore = option.tokenAliases.reduce(
    (best, term) => Math.max(best, getMatchScore(term, keyword, compactKeyword, 820, 640, 460)),
    0
  )

  const categoryAliasScore = option.categoryAliases.reduce(
    (best, term) => Math.max(best, getMatchScore(term, keyword, compactKeyword, 520, 380, 240)),
    0
  )

  return Math.max(baseScore, manualAliasScore, tokenAliasScore, categoryAliasScore)
}

export function searchServiceIconOptions(keyword: string) {
  const normalizedKeyword = normalizeSearchTerm(keyword)
  if (!normalizedKeyword) {
    return serviceIconOptions
  }

  return serviceIconOptions
    .map((option) => ({
      option,
      score: getSearchScore(option, normalizedKeyword),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.option.label.localeCompare(right.option.label)
    )
    .map((entry) => entry.option)
}

export const serviceIconOptions: ServiceIconOption[] = (
  Object.keys(dynamicIconImports) as DynamicIconName[]
)
  .sort((left, right) => left.localeCompare(right))
  .map((loaderKey) => {
    const label = toPascalCase(loaderKey)
    const categories = buildIconCategories(loaderKey)
    const categoryAliases = buildCategoryAliases(categories)
    const manualAliases = buildIconManualAliases(loaderKey)
    const tokenAliases = buildIconTokenAliases(loaderKey)

    return {
      label,
      loaderKey,
      categories,
      categoryAliases,
      manualAliases,
      tokenAliases,
      searchText: buildIconSearchText(loaderKey, label, [
        ...manualAliases,
        ...tokenAliases,
        ...categoryAliases,
      ]),
    }
  })
