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
  persistSceneState,
  readInitialActiveSceneId,
  readLastRegularSceneId,
  readSceneTokens,
  removeSceneToken,
} from '@/features/navigation/scenePreference'

interface AppState {
  networkMode: NetworkMode
  detectedNetworkMode: NetworkMode
  networkModeStrategy: NetworkModeStrategy
  manualNetworkMode: ManualNetworkMode
  searchKeyword: string
  theme: 'light' | 'dark'
  language: Language
  error: string | null
  activeSceneId: string | null
  lastRegularSceneId: string | null
  sceneTokens: Record<string, string>
  setDetectedNetworkMode: (mode: NetworkMode) => void
  setNetworkModeStrategy: (strategy: NetworkModeStrategy) => void
  setManualNetworkMode: (mode: ManualNetworkMode) => void
  setSearchKeyword: (keyword: string) => void
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

export const useAppStore = create<AppState>()((set) => ({
  networkMode: resolveEffectiveNetworkMode(
    initialDetectedNetworkMode,
    initialNetworkModeStrategy,
    initialManualNetworkMode
  ),
  detectedNetworkMode: initialDetectedNetworkMode,
  networkModeStrategy: initialNetworkModeStrategy,
  manualNetworkMode: initialManualNetworkMode,
  searchKeyword: '',
  theme: 'light',
  language: resolveInitialLanguage(),
  error: null,
  activeSceneId: readInitialActiveSceneId(),
  lastRegularSceneId: readLastRegularSceneId(),
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
  setTheme: (theme) => {
    set({ theme })
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
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
      return { sceneTokens }
    })
  },
}))
