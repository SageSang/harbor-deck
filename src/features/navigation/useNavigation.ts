import { useEffect, useRef, useState } from 'react'
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
  const accessVersion = useAppStore((state) => state.sceneAccessVersion)
  return useQuery({
    queryKey: [...navigationConfigQueryKey, accessVersion],
    queryFn: ({ signal }) => fetchNavigationConfig(signal),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  })
}

interface NavigationSaveCallbacks {
  onSuccess?: (saved: NavigationConfig, current: NavigationConfig) => void
  onError?: (error: Error) => void
}

/** scopeKey identifies the editing surface, independently of the access version. */
export function useSaveNavigationConfig(scopeKey = '') {
  const queryClient = useQueryClient()
  const accessVersion = useAppStore((state) => state.sceneAccessVersion)
  const scopeRef = useRef({ key: scopeKey, operation: 0, mounted: true })
  if (scopeRef.current.key !== scopeKey) {
    scopeRef.current = { key: scopeKey, operation: scopeRef.current.operation + 1, mounted: true }
  }

  function capture(config: NavigationConfig, callbacks?: NavigationSaveCallbacks) {
    const version = useAppStore.getState().sceneAccessVersion
    const queryKey = [...navigationConfigQueryKey, version] as const
    const query = queryClient.getQueryCache().find({ queryKey, exact: true })
    return {
      config,
      callbacks,
      queryKey,
      query,
      dataUpdateCount: query?.state.dataUpdateCount,
      accessVersion: version,
      scopeKey,
      operation: ++scopeRef.current.operation,
    }
  }
  type SaveRequest = ReturnType<typeof capture>
  type SaveResult = {
    request: SaveRequest
    saved?: NavigationConfig
    current?: NavigationConfig
    syncError?: Error
  }
  const [syncFailure, setSyncFailure] = useState<SaveResult | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  function isCurrent(request: SaveRequest) {
    return (
      scopeRef.current.mounted &&
      request.accessVersion === useAppStore.getState().sceneAccessVersion &&
      request.scopeKey === scopeRef.current.key &&
      request.operation === scopeRef.current.operation
    )
  }

  function invalidateDerived() {
    void queryClient.invalidateQueries({ queryKey: appConfigQueryKey })
    void queryClient.invalidateQueries({ queryKey: sceneListQueryKey })
    void queryClient.invalidateQueries({ queryKey: ['navigation', 'services'] })
  }

  function refreshAfterObsoleteForm(request: SaveRequest) {
    // The server may have committed even though this form was closed or replaced.
    // Refresh the still-current access scope; never adopt its old response body.
    if (request.accessVersion !== useAppStore.getState().sceneAccessVersion) return
    void queryClient.invalidateQueries({ queryKey: request.queryKey, exact: true })
    invalidateDerived()
  }

  async function synchronize(
    request: SaveRequest,
    saved: NavigationConfig,
    forceRead = false
  ): Promise<SaveResult> {
    const result: SaveResult = { request }
    if (!isCurrent(request)) {
      refreshAfterObsoleteForm(request)
      return result
    }
    await queryClient.cancelQueries({ queryKey: request.queryKey, exact: true })
    // Lock/logout can remove this query while cancellation is settling.
    if (!isCurrent(request)) {
      refreshAfterObsoleteForm(request)
      return result
    }
    result.saved = saved
    const query = queryClient.getQueryCache().find({ queryKey: request.queryKey, exact: true })
    const cached = query?.state.data as NavigationConfig | undefined
    const unchanged =
      query === request.query &&
      query?.state.dataUpdateCount === request.dataUpdateCount &&
      cached?._revision !== undefined &&
      cached._revision === request.config._revision

    if (!forceRead && unchanged) {
      queryClient.setQueryData(request.queryKey, saved)
      result.current = saved
    } else if (!forceRead && cached?._revision === saved._revision && saved._revision) {
      result.current = cached
    } else {
      try {
        // Hash revisions have no ordering. Read again when another result was observed,
        // including A -> B -> A, instead of overwriting it with this PUT response.
        result.current = await queryClient.fetchQuery({
          queryKey: request.queryKey,
          queryFn: ({ signal }) => fetchNavigationConfig(signal),
          staleTime: 0,
          retry: false,
        })
      } catch (error) {
        if (isCurrent(request)) {
          result.syncError =
            error instanceof Error ? error : new Error('页面同步失败 / Page synchronization failed')
        }
      }
    }
    if (!isCurrent(request)) return { request }
    invalidateDerived()
    return result
  }

  function deliver(result: SaveResult) {
    if (!isCurrent(result.request)) return
    if (result.syncError) {
      setSyncFailure(result)
    } else if (result.saved && result.current) {
      setSyncFailure(null)
      result.request.callbacks?.onSuccess?.(result.saved, result.current)
    }
  }

  const mutation = useMutation({
    mutationFn: async (request: SaveRequest) => {
      if (!isCurrent(request)) return { request }
      const saved = await saveNavigationConfig(request.config)
      return synchronize(request, saved)
    },
    onSuccess: deliver,
    onError: (error: Error, request) => {
      if (!isCurrent(request)) return
      if (error instanceof ApiError && error.status === 412) {
        void queryClient.invalidateQueries({ queryKey: request.queryKey, exact: true })
        invalidateDerived()
      }
      request.callbacks?.onError?.(error)
    },
  })

  useEffect(() => {
    scopeRef.current.mounted = true
    return () => {
      scopeRef.current.mounted = false
    }
  }, [])
  useEffect(() => {
    setSyncFailure(null)
    setIsSyncing(false)
  }, [scopeKey, accessVersion])

  const currentFailure = syncFailure && isCurrent(syncFailure.request) ? syncFailure : null
  return {
    isPending: mutation.isPending,
    isSaveBlocked: mutation.isPending || isSyncing || Boolean(currentFailure),
    syncError: currentFailure?.syncError ?? null,
    isSyncing,
    mutate: (config: NavigationConfig, callbacks?: NavigationSaveCallbacks) => {
      if (mutation.isPending || isSyncing || currentFailure) return
      mutation.mutate(capture(config, callbacks))
    },
    retrySync: async () => {
      if (!currentFailure?.saved || isSyncing) return
      setIsSyncing(true)
      const result = await synchronize(currentFailure.request, currentFailure.saved, true)
      if (!isCurrent(currentFailure.request)) return
      setIsSyncing(false)
      deliver(result)
    },
  }
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
  }, [activeSceneId, initializeActiveScene, lastRegularSceneId, sceneListQuery.data, sceneTokens])

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

  const accessVersion = useAppStore((state) => state.sceneAccessVersion)
  const query = useQuery({
    queryKey: [...sceneServicesQueryKey(activeSceneId), accessVersion],
    queryFn: ({ signal }) => fetchSceneServices(activeSceneId!, token, signal),
    enabled: Boolean(activeSceneId && activeScene && (!activeScene.protected || token)),
    staleTime: 30_000,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 403) && failureCount < 2,
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
    mutationFn: ({
      sceneId,
      password,
      revision,
    }: {
      sceneId: string
      password: string | null
      revision?: string
    }) => setScenePassword(sceneId, password, revision),
    onSuccess: () => {
      useAppStore.getState().clearSceneTokens()
      void queryClient.invalidateQueries({ queryKey: navigationConfigQueryKey })
      void queryClient.invalidateQueries({ queryKey: sceneListQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['navigation', 'services'] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 412) {
        void queryClient.invalidateQueries({ queryKey: navigationConfigQueryKey })
        void queryClient.invalidateQueries({ queryKey: sceneListQueryKey })
        void queryClient.invalidateQueries({ queryKey: ['navigation', 'services'] })
      }
    },
  })
}
