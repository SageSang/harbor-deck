import type { NetworkMode } from './detectNetworkMode'

export type NetworkModeStrategy = 'auto' | 'manual'
export type ManualNetworkMode = Exclude<NetworkMode, 'unknown'>

export const NETWORK_MODE_STRATEGY_STORAGE_KEY = 'harbordeck-network-mode-strategy'
export const MANUAL_NETWORK_MODE_STORAGE_KEY = 'harbordeck-manual-network-mode'
const LEGACY_NETWORK_MODE_STRATEGY_STORAGE_KEY = ['smart', '-harbor-network-mode-strategy'].join('')
const LEGACY_MANUAL_NETWORK_MODE_STORAGE_KEY = ['smart', '-harbor-manual-network-mode'].join('')

const DEFAULT_NETWORK_MODE_STRATEGY: NetworkModeStrategy = 'auto'
const DEFAULT_MANUAL_NETWORK_MODE: ManualNetworkMode = 'lan'

function normalizeNetworkModeStrategy(value: string | null): NetworkModeStrategy {
  return value === 'manual' ? 'manual' : DEFAULT_NETWORK_MODE_STRATEGY
}

function normalizeManualNetworkMode(value: string | null): ManualNetworkMode {
  return value === 'wan' ? 'wan' : DEFAULT_MANUAL_NETWORK_MODE
}

function readMigratedPreference(key: string, legacyKey: string) {
  const current = window.localStorage.getItem(key)
  if (current !== null) {
    return current
  }

  const legacy = window.localStorage.getItem(legacyKey)
  if (legacy !== null) {
    window.localStorage.setItem(key, legacy)
  }
  return legacy
}

export function resolveInitialNetworkModeStrategy(): NetworkModeStrategy {
  if (typeof window === 'undefined') {
    return DEFAULT_NETWORK_MODE_STRATEGY
  }

  return normalizeNetworkModeStrategy(
    readMigratedPreference(
      NETWORK_MODE_STRATEGY_STORAGE_KEY,
      LEGACY_NETWORK_MODE_STRATEGY_STORAGE_KEY
    )
  )
}

export function resolveInitialManualNetworkMode(): ManualNetworkMode {
  if (typeof window === 'undefined') {
    return DEFAULT_MANUAL_NETWORK_MODE
  }

  return normalizeManualNetworkMode(
    readMigratedPreference(MANUAL_NETWORK_MODE_STORAGE_KEY, LEGACY_MANUAL_NETWORK_MODE_STORAGE_KEY)
  )
}

export function persistNetworkModeStrategy(strategy: NetworkModeStrategy) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(NETWORK_MODE_STRATEGY_STORAGE_KEY, strategy)
}

export function persistManualNetworkMode(mode: ManualNetworkMode) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(MANUAL_NETWORK_MODE_STORAGE_KEY, mode)
}

export function resolveEffectiveNetworkMode(
  detectedMode: NetworkMode,
  strategy: NetworkModeStrategy,
  manualMode: ManualNetworkMode
): NetworkMode {
  if (strategy === 'manual') {
    return manualMode
  }

  return detectedMode
}
