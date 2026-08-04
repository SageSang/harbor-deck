import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NavigationConfig } from '@/config/schema'
import {
  ApiError,
  appConfigQueryKey,
  fetchNavigationConfig,
  fetchSceneList,
  fetchSceneServices,
  lockScene,
  navigationConfigQueryKey,
  saveNavigationConfig,
  sceneListQueryKey,
  sceneServicesQueryKey,
  setScenePassword,
  unlockScene,
} from '@/features/config/api'
import { useAppStore } from '@/store/appStore'

export function useNavigationConfig(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: navigationConfigQueryKey,
    queryFn: fetchNavigationConfig,
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  })
}

export function useSaveNavigationConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: NavigationConfig) => saveNavigationConfig(config),
    onSuccess: (savedConfig) => {
      queryClient.setQueryData(navigationConfigQueryKey, savedConfig)
      void queryClient.invalidateQueries({ queryKey: appConfigQueryKey })
      void queryClient.invalidateQueries({ queryKey: sceneListQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['navigation', 'services'] })
    },
  })
}

export function useSceneList() {
  return useQuery({
    queryKey: sceneListQueryKey,
    queryFn: fetchSceneList,
    staleTime: 30_000,
  })
}

export function useActiveScene() {
  const sceneListQuery = useSceneList()
  const activeSceneId = useAppStore((state) => state.activeSceneId)
  const lastRegularSceneId = useAppStore((state) => state.lastRegularSceneId)
  const sceneTokens = useAppStore((state) => state.sceneTokens)
  const initializeActiveScene = useAppStore((state) => state.initializeActiveScene)

  useEffect(() => {
    const sceneList = sceneListQuery.data
    if (!sceneList || sceneList.scenes.length === 0) {
      return
    }

    const activeScene = sceneList.scenes.find((scene) => scene.id === activeSceneId)
    if (activeScene && (!activeScene.protected || sceneTokens[activeScene.id])) {
      return
    }

    const lastRegularScene = sceneList.scenes.find(
      (scene) => scene.id === lastRegularSceneId && !scene.protected
    )
    const defaultScene = sceneList.scenes.find((scene) => scene.id === sceneList.defaultSceneId)
    const fallback =
      lastRegularScene ??
      (defaultScene && !defaultScene.protected ? defaultScene : undefined) ??
      sceneList.scenes.find((scene) => !scene.protected) ??
      defaultScene ??
      sceneList.scenes[0]

    initializeActiveScene(fallback.id, fallback.protected)
  }, [
    activeSceneId,
    initializeActiveScene,
    lastRegularSceneId,
    sceneListQuery.data,
    sceneTokens,
  ])

  const activeScene = sceneListQuery.data?.scenes.find((scene) => scene.id === activeSceneId)
  return { sceneListQuery, activeSceneId, activeScene }
}

export function useActiveSceneServices() {
  const { sceneListQuery, activeSceneId, activeScene } = useActiveScene()
  const token = useAppStore((state) =>
    activeSceneId ? state.sceneTokens[activeSceneId] : undefined
  )
  const clearSceneToken = useAppStore((state) => state.clearSceneToken)
  const initializeActiveScene = useAppStore((state) => state.initializeActiveScene)
  const lastRegularSceneId = useAppStore((state) => state.lastRegularSceneId)

  const query = useQuery({
    queryKey: sceneServicesQueryKey(activeSceneId),
    queryFn: () => fetchSceneServices(activeSceneId!, token),
    enabled: Boolean(activeSceneId && activeScene),
    staleTime: 30_000,
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 403) && failureCount < 2,
  })

  useEffect(() => {
    if (!(query.error instanceof ApiError) || query.error.status !== 403 || !activeSceneId) {
      return
    }
    clearSceneToken(activeSceneId)
    const fallback = sceneListQuery.data?.scenes.find(
      (scene) => scene.id === lastRegularSceneId && !scene.protected
    )
    if (fallback) {
      initializeActiveScene(fallback.id, false)
    }
  }, [
    activeSceneId,
    clearSceneToken,
    initializeActiveScene,
    lastRegularSceneId,
    query.error,
    sceneListQuery.data,
  ])

  return { ...query, activeSceneId, activeScene, sceneListQuery }
}

export function useUnlockScene() {
  return useMutation({
    mutationFn: ({ sceneId, password }: { sceneId: string; password: string }) =>
      unlockScene(sceneId, password),
  })
}

export function useLockScene() {
  return useMutation({
    mutationFn: ({ sceneId, token }: { sceneId: string; token?: string }) =>
      lockScene(sceneId, token),
  })
}

export function useSetScenePassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sceneId, password }: { sceneId: string; password: string | null }) =>
      setScenePassword(sceneId, password),
    onSuccess: (navigation) => {
      queryClient.setQueryData(navigationConfigQueryKey, navigation)
      void queryClient.invalidateQueries({ queryKey: sceneListQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['navigation', 'services'] })
    },
  })
}
