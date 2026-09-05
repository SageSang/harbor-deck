import { create } from 'zustand'
import type { NetworkMode } from '@/core/network/detectNetworkMode'
import {
  persistManualNetworkMode,
  persistNetworkModeStrategy,
  resolveEffectiveNetworkMode,
  resolveInitialManualNetworkMode,
  resolveInitialNetworkModeStrategy,
  type ManualNetworkMode,
  type NetworkModeStrategy,
} from '@/core/network/networkModePreference'
import { persistLanguage, resolveInitialLanguage, type Language } from '@/i18n/messages'
import {
  DEFAULT_APP_SKIN,
  normalizeAppSkin,
  skinUsesDarkMode,
  type AppSkin,
  WEB_THEME_STORAGE_KEY,
} from '@shared/theme'
import {
  persistSceneState,
  readInitialActiveSceneId,
  readLastRegularSceneId,
  readSceneTokens,
  removeSceneToken,
} from '@/features/navigation/scenePreference'

interface AppState {
  networkProbeVersion: number
  requestNetworkDetection: () => void
  networkMode: NetworkMode
  detectedNetworkMode: NetworkMode
  networkModeStrategy: NetworkModeStrategy
  manualNetworkMode: ManualNetworkMode
  searchKeyword: string
  skin: AppSkin
  theme: 'light' | 'dark'
  language: Language
  error: string | null
  activeSceneId: string | null
  lastRegularSceneId: string | null
  sceneAccessVersion: number
  clearSceneTokens: () => void
  sceneTokens: Record<string, string>
  setDetectedNetworkMode: (mode: NetworkMode) => void
  setNetworkModeStrategy: (strategy: NetworkModeStrategy) => void
  setManualNetworkMode: (mode: ManualNetworkMode) => void
  setSearchKeyword: (keyword: string) => void
  setSkin: (skin: AppSkin) => void
  setTheme: (theme: 'light' | 'dark') => void
  setLanguage: (language: Language) => void
  setError: (error: string | null) => void
  setActiveScene: (sceneId: string, options: { protected: boolean; token?: string }) => void
  initializeActiveScene: (sceneId: string, protectedScene: boolean) => void
  clearSceneToken: (sceneId: string) => void
}

const initialDetectedNetworkMode: NetworkMode = 'unknown'
const initialNetworkModeStrategy = resolveInitialNetworkModeStrategy()
const initialManualNetworkMode = resolveInitialManualNetworkMode()

function resolveInitialSkin(): AppSkin {
  if (typeof window === 'undefined') return DEFAULT_APP_SKIN

  try {
    const stored = window.localStorage.getItem(WEB_THEME_STORAGE_KEY)
    if (stored) return normalizeAppSkin(stored)
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'frost' : DEFAULT_APP_SKIN
  } catch {
    return DEFAULT_APP_SKIN
  }
}

function persistSkin(skin: AppSkin) {
  try {
    window.localStorage.setItem(WEB_THEME_STORAGE_KEY, skin)
  } catch {
    // Theme rendering remains functional when browser storage is unavailable.
  }
}

const initialSkin = resolveInitialSkin()

export const useAppStore = create<AppState>()((set) => ({
  networkProbeVersion: 0,
  requestNetworkDetection: () =>
    set((state) => ({ networkProbeVersion: state.networkProbeVersion + 1 })),
  networkMode: resolveEffectiveNetworkMode(
    initialDetectedNetworkMode,
    initialNetworkModeStrategy,
    initialManualNetworkMode
  ),
  detectedNetworkMode: initialDetectedNetworkMode,
  networkModeStrategy: initialNetworkModeStrategy,
  manualNetworkMode: initialManualNetworkMode,
  searchKeyword: '',
  skin: initialSkin,
  theme: skinUsesDarkMode(initialSkin) ? 'dark' : 'light',
  language: resolveInitialLanguage(),
  error: null,
  activeSceneId: readInitialActiveSceneId(),
  lastRegularSceneId: readLastRegularSceneId(),
  sceneAccessVersion: 0,
  clearSceneTokens: () => {
    Object.keys(readSceneTokens()).forEach(removeSceneToken)
    set((state) => ({ sceneTokens: {}, sceneAccessVersion: state.sceneAccessVersion + 1 }))
  },
  sceneTokens: readSceneTokens(),
  setDetectedNetworkMode: (mode) =>
    set((state) => ({
      detectedNetworkMode: mode,
      networkMode: resolveEffectiveNetworkMode(
        mode,
        state.networkModeStrategy,
        state.manualNetworkMode
      ),
    })),
  setNetworkModeStrategy: (strategy) => {
    persistNetworkModeStrategy(strategy)
    set((state) => ({
      networkModeStrategy: strategy,
      networkMode: resolveEffectiveNetworkMode(
        state.detectedNetworkMode,
        strategy,
        state.manualNetworkMode
      ),
    }))
  },
  setManualNetworkMode: (mode) => {
    persistManualNetworkMode(mode)
    set((state) => ({
      manualNetworkMode: mode,
      networkMode: resolveEffectiveNetworkMode(
        state.detectedNetworkMode,
        state.networkModeStrategy,
        mode
      ),
    }))
  },
  setSearchKeyword: (keyword) => set({ searchKeyword: keyword }),
  setSkin: (skin) => {
    persistSkin(skin)
    set({
      skin,
      theme: skinUsesDarkMode(skin) ? 'dark' : 'light',
    })
    document.documentElement.dataset.skin = skin
    document.documentElement.classList.toggle('dark', skinUsesDarkMode(skin))
  },
  setTheme: (theme) => {
    const skin = theme === 'dark' ? 'midnight' : 'frost'
    persistSkin(skin)
    set({ theme, skin })
    document.documentElement.dataset.skin = skin
    document.documentElement.classList.toggle('dark', theme === 'dark')
  },
  setLanguage: (language) => {
    persistLanguage(language)
    set({ language })
  },
  setError: (error) => set({ error }),
  setActiveScene: (sceneId, options) => {
    persistSceneState(sceneId, options)
    set((state) => ({
      activeSceneId: sceneId,
      lastRegularSceneId: options.protected ? state.lastRegularSceneId : sceneId,
      sceneAccessVersion: options.token ? state.sceneAccessVersion + 1 : state.sceneAccessVersion,
      sceneTokens: options.token
        ? { ...state.sceneTokens, [sceneId]: options.token }
        : state.sceneTokens,
    }))
  },
  initializeActiveScene: (sceneId, protectedScene) => {
    persistSceneState(sceneId, { protected: protectedScene })
    set((state) => ({
      activeSceneId: sceneId,
      lastRegularSceneId: protectedScene ? state.lastRegularSceneId : sceneId,
    }))
  },
  clearSceneToken: (sceneId) => {
    removeSceneToken(sceneId)
    set((state) => {
      const sceneTokens = { ...state.sceneTokens }
      delete sceneTokens[sceneId]
      return { sceneTokens, sceneAccessVersion: state.sceneAccessVersion + 1 }
    })
  },
}))
