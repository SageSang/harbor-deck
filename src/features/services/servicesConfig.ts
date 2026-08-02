import { pinyin } from 'pinyin-pro'
import { defaultServicesConfig as bundledDefaultServicesConfig } from '@/config/defaultConfig'
import {
  serviceConfigSchema,
  servicesConfigSchema,
  type Service,
  type ServiceConfig,
  type ServiceGroupConfig,
  type ServicesConfig,
} from '@/config/schema'
import { getCurrentMessages } from '@/i18n/runtime'

export interface ServiceGroup {
  category: string
  services: Service[]
}

export interface ServiceLocation {
  groupIndex: number
  serviceIndex: number
}

export const defaultServicesConfig = parseServicesConfig(bundledDefaultServicesConfig)

export function parseServicesConfig(input: unknown): ServicesConfig {
  const messages = getCurrentMessages()
  let validated: ServicesConfig

  try {
    validated = servicesConfigSchema.parse(input)
  } catch {
    throw new Error(messages.common.invalidContentRetry)
  }

  assertUniqueServiceSlugs(validated)
  return validated
}

export function parseServicesConfigText(input: string): ServicesConfig {
  const messages = getCurrentMessages()
  const trimmed = input.trim()

  try {
    return parseServicesConfig(trimmed ? JSON.parse(trimmed) : undefined)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(messages.common.invalidContentRetry)
    }
    throw error
  }
}

export function normalizeServicesConfig(groups: ServiceGroupConfig[]): ServiceGroup[] {
  return groups.map((group) => ({
    category: group.category,
    services: group.items.map((service) => ({
      ...service,
      category: group.category,
    })),
  }))
}

export function formatServicesConfig(config: ServicesConfig) {
  return JSON.stringify(cleanServicesConfig(config), null, 2)
}

export function cloneServicesConfig(config: ServicesConfig): ServicesConfig {
  return config.map((group) => ({
    category: group.category,
    items: group.items.map((service) => ({
      ...service,
      probes: service.probes ? [...service.probes] : undefined,
    })),
  }))
}

export function cleanServicesConfig(config: ServicesConfig): ServicesConfig {
  const cleaned = config.map((group) => ({
    category: group.category.trim(),
    items: group.items.map((service) => cleanServiceConfig(service)),
  }))

  return parseServicesConfig(cleaned)
}

export function cleanServiceConfig(service: ServiceConfig): ServiceConfig {
  const icon = service.icon?.trim()
  const note = service.note?.trim()
  const probes = service.probes?.map((probe) => probe.trim()).filter(Boolean)
  const secondaryUrl = service.secondaryUrl?.trim()

  return serviceConfigSchema.parse({
    slug: service.slug,
    name: service.name,
    ...(note ? { note } : {}),
    primaryUrl: service.primaryUrl,
    ...(secondaryUrl ? { secondaryUrl } : {}),
    ...(icon ? { icon } : {}),
    ...(probes && probes.length > 0 ? { probes } : {}),
    ...(service.forceNewTab ? { forceNewTab: true } : {}),
  })
}

function transliterateSlugSource(value: string) {
  return pinyin(value.trim(), {
    toneType: 'none',
    nonZh: 'consecutive',
    v: true,
  })
}

export function slugify(value: string, fallback = 'service') {
  const normalized = transliterateSlugSource(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

export function buildUniqueSlug(
  name: string,
  config: ServicesConfig,
  currentSlug?: string,
  fallback = 'service'
) {
  const base = slugify(name, fallback)
  const occupied = new Set(
    config
      .flatMap((group) => group.items.map((service) => service.slug))
      .filter((slug) => slug && slug !== currentSlug)
  )

  if (!occupied.has(base)) {
    return base
  }

  let nextIndex = 2
  while (occupied.has(`${base}-${nextIndex}`)) {
    nextIndex += 1
  }

  return `${base}-${nextIndex}`
}

export function validateGroupName(name: string, config: ServicesConfig, currentIndex?: number) {
  const messages = getCurrentMessages()
  const trimmedName = name.trim()

  if (!trimmedName) {
    throw new Error(messages.errors.groupNameRequired)
  }

  const duplicated = config.some(
    (group, index) => index !== currentIndex && group.category === trimmedName
  )

  if (duplicated) {
    throw new Error(messages.errors.groupExists(trimmedName))
  }

  return trimmedName
}

export function moveGroup(config: ServicesConfig, fromIndex: number, toIndex: number) {
  const messages = getCurrentMessages()
  const nextConfig = cloneServicesConfig(config)

  if (fromIndex < 0 || fromIndex >= nextConfig.length) {
    throw new Error(messages.errors.sourceGroupMissing)
  }

  if (toIndex < 0 || toIndex >= nextConfig.length) {
    throw new Error(messages.errors.targetGroupMissing)
  }

  if (fromIndex === toIndex) {
    return nextConfig
  }

  const [group] = nextConfig.splice(fromIndex, 1)
  if (!group) {
    throw new Error(messages.errors.groupToMoveMissing)
  }

  nextConfig.splice(toIndex, 0, group)
  return nextConfig
}

export function findServiceLocation(config: ServicesConfig, slug: string): ServiceLocation | null {
  for (let groupIndex = 0; groupIndex < config.length; groupIndex += 1) {
    const serviceIndex = config[groupIndex].items.findIndex((service) => service.slug === slug)

    if (serviceIndex >= 0) {
      return { groupIndex, serviceIndex }
    }
  }

  return null
}

export function removeService(config: ServicesConfig, location: ServiceLocation) {
  const messages = getCurrentMessages()
  const nextConfig = cloneServicesConfig(config)
  const targetGroup = nextConfig[location.groupIndex]

  if (!targetGroup) {
    throw new Error(messages.errors.bookmarkGroupMissing)
  }

  const removed = targetGroup.items.splice(location.serviceIndex, 1)
  if (removed.length === 0) {
    throw new Error(messages.errors.bookmarkToDeleteMissing)
  }

  return nextConfig
}

export function insertService(
  config: ServicesConfig,
  groupIndex: number,
  service: ServiceConfig,
  serviceIndex?: number
) {
  const messages = getCurrentMessages()
  const nextConfig = cloneServicesConfig(config)
  const targetGroup = nextConfig[groupIndex]

  if (!targetGroup) {
    throw new Error(messages.errors.targetGroupMissing)
  }

  const nextService = cleanServiceConfig(service)
  const insertIndex =
    typeof serviceIndex === 'number'
      ? Math.min(Math.max(serviceIndex, 0), targetGroup.items.length)
      : targetGroup.items.length

  targetGroup.items.splice(insertIndex, 0, nextService)
  return nextConfig
}

export function moveService(
  config: ServicesConfig,
  source: ServiceLocation,
  targetGroupIndex: number,
  targetServiceIndex?: number
) {
  const messages = getCurrentMessages()
  const nextConfig = cloneServicesConfig(config)
  const sourceGroup = nextConfig[source.groupIndex]
  const targetGroup = nextConfig[targetGroupIndex]

  if (!sourceGroup) {
    throw new Error(messages.errors.sourceGroupNotFound)
  }

  if (!targetGroup) {
    throw new Error(messages.errors.targetGroupNotFound)
  }

  const [service] = sourceGroup.items.splice(source.serviceIndex, 1)
  if (!service) {
    throw new Error(messages.errors.bookmarkToMoveMissing)
  }

  const adjustedIndex =
    typeof targetServiceIndex === 'number'
      ? targetGroupIndex === source.groupIndex && source.serviceIndex < targetServiceIndex
        ? targetServiceIndex - 1
        : targetServiceIndex
      : targetGroup.items.length

  const insertIndex = Math.min(Math.max(adjustedIndex, 0), targetGroup.items.length)
  targetGroup.items.splice(insertIndex, 0, service)

  return nextConfig
}

export function replaceService(
  config: ServicesConfig,
  location: ServiceLocation,
  service: ServiceConfig
) {
  const messages = getCurrentMessages()
  const nextConfig = cloneServicesConfig(config)
  const targetGroup = nextConfig[location.groupIndex]

  if (!targetGroup?.items[location.serviceIndex]) {
    throw new Error(messages.errors.bookmarkToUpdateMissing)
  }

  targetGroup.items[location.serviceIndex] = cleanServiceConfig(service)
  return nextConfig
}

function assertUniqueServiceSlugs(groups: ServiceGroupConfig[]) {
  const messages = getCurrentMessages()
  const usedSlugs = new Set<string>()

  for (const group of groups) {
    for (const service of group.items) {
      if (usedSlugs.has(service.slug)) {
        throw new Error(messages.errors.duplicateServiceSlug(service.slug))
      }
      usedSlugs.add(service.slug)
    }
  }
}
