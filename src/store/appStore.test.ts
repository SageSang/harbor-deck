import { beforeEach, describe, expect, it, vi } from 'vitest'

async function loadAppStore() {
  vi.resetModules()
  return import('@/store/appStore')
}

describe('useAppStore network mode preferences', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('hydrates manual network settings from localStorage', async () => {
    window.localStorage.setItem('harbordeck-network-mode-strategy', 'manual')
    window.localStorage.setItem('harbordeck-manual-network-mode', 'wan')

    const { useAppStore } = await loadAppStore()
    const state = useAppStore.getState()

    expect(state.networkModeStrategy).toBe('manual')
    expect(state.manualNetworkMode).toBe('wan')
    expect(state.networkMode).toBe('wan')
  })

  it('keeps the manual mode active when detection updates in the background', async () => {
    const { useAppStore } = await loadAppStore()

    useAppStore.getState().setManualNetworkMode('lan')
    useAppStore.getState().setNetworkModeStrategy('manual')
    useAppStore.getState().setDetectedNetworkMode('wan')

    const state = useAppStore.getState()

    expect(state.detectedNetworkMode).toBe('wan')
    expect(state.networkModeStrategy).toBe('manual')
    expect(state.networkMode).toBe('lan')
  })

  it('returns to the latest detected mode after switching back to auto', async () => {
    const { useAppStore } = await loadAppStore()

    useAppStore.getState().setDetectedNetworkMode('wan')
    useAppStore.getState().setManualNetworkMode('lan')
    useAppStore.getState().setNetworkModeStrategy('manual')

    expect(useAppStore.getState().networkMode).toBe('lan')

    useAppStore.getState().setNetworkModeStrategy('auto')

    const state = useAppStore.getState()

    expect(state.networkModeStrategy).toBe('auto')
    expect(state.networkMode).toBe('wan')
    expect(window.localStorage.getItem('harbordeck-network-mode-strategy')).toBe('auto')
  })
})
