import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { NavigationConfig } from '@/config/schema'
import { useFeedback } from '@/features/feedback/useFeedback'
import { getGroupKey } from '@/features/navigation/groupExpansion'
import {
  fetchGroupExpansionPreference,
  groupExpansionQueryKey,
  initializeGroupExpansionPreference,
  parseGroupExpansionSnapshot,
  saveGroupExpansion,
  saveSceneGroupExpansion,
  type GroupExpansionSnapshot,
} from '@/features/navigation/groupExpansionApi'
import { GroupExpansionContext } from '@/features/navigation/groupExpansionContext'
import {
  applyGroupExpansion,
  applySceneGroupExpansion,
} from '@/features/navigation/groupExpansionState'
import {
  clearLegacyCollapsedGroupKeys,
  deriveLegacyExpandedGroupKeys,
  readLegacyCollapsedGroupKeys,
} from '@/features/navigation/groupPreference'
import { useNavigationConfig } from '@/features/navigation/useNavigation'
import { useI18n } from '@/i18n/runtime'

const GROUP_EXPANSION_CHANNEL = 'harbordeck-group-expansion'

export function GroupExpansionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const navigationQuery = useNavigationConfig()
  const { showToast } = useFeedback()
  const { messages } = useI18n()
  const preferenceQuery = useQuery({
    queryKey: groupExpansionQueryKey,
    queryFn: fetchGroupExpansionPreference,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const [initializeAttempt, setInitializeAttempt] = useState(0)
  const [fallbackKeys, setFallbackKeys] = useState<string[]>([])
  const [pendingGroupKeys, setPendingGroupKeys] = useState<Set<string>>(() => new Set())
  const [pendingSceneIds, setPendingSceneIds] = useState<Set<string>>(() => new Set())
  const channelRef = useRef<BroadcastChannel | null>(null)
  const navigationRef = useRef<NavigationConfig | undefined>(undefined)
  const initializingRef = useRef(false)
  const loadErrorShownRef = useRef(false)
  const groupQueueRef = useRef(new Map<string, Promise<void>>())
  const operationIdRef = useRef(0)
  const lastGroupOperationRef = useRef(new Map<string, number>())
  const pendingGroupDesiredRef = useRef(new Map<string, boolean>())
  const pendingSceneDesiredRef = useRef(new Map<string, boolean>())
  const confirmedDesiredRef = useRef(new Map<string, boolean>())
  const reconcileIdRef = useRef(0)

  navigationRef.current = navigationQuery.data

  const applyLocalOverlays = useCallback((snapshot: GroupExpansionSnapshot) => {
    let next = snapshot
    const navigation = navigationRef.current

    confirmedDesiredRef.current.forEach((expanded, key) => {
      const separator = key.indexOf(':')
      if (separator > 0) {
        next = applyGroupExpansion(
          next,
          key.slice(0, separator),
          key.slice(separator + 1),
          expanded
        )
      }
    })
    if (navigation) {
      pendingSceneDesiredRef.current.forEach((expanded, sceneId) => {
        next = applySceneGroupExpansion(next, navigation, sceneId, expanded)
      })
    }
    pendingGroupDesiredRef.current.forEach((expanded, key) => {
      const separator = key.indexOf(':')
      if (separator > 0) {
        next = applyGroupExpansion(
          next,
          key.slice(0, separator),
          key.slice(separator + 1),
          expanded
        )
      }
    })

    return next
  }, [])

  const setServerSnapshot = useCallback(
    (snapshot: GroupExpansionSnapshot) => {
      queryClient.setQueryData(groupExpansionQueryKey, applyLocalOverlays(snapshot))
    },
    [applyLocalOverlays, queryClient]
  )

  const broadcastSnapshot = useCallback((snapshot: GroupExpansionSnapshot) => {
    channelRef.current?.postMessage(snapshot)
  }, [])

  const hasPendingOperations = useCallback(
    () => pendingGroupDesiredRef.current.size > 0 || pendingSceneDesiredRef.current.size > 0,
    []
  )

  const reconcileServerSnapshot = useCallback(async () => {
    reconcileIdRef.current += 1
    const reconcileId = reconcileIdRef.current
    try {
      const snapshot = await fetchGroupExpansionPreference()
      if (reconcileId !== reconcileIdRef.current) {
        return
      }
      if (!hasPendingOperations()) {
        confirmedDesiredRef.current.clear()
      }
      setServerSnapshot(snapshot)
    } catch {
      // A later focus or visibility refresh will retry reconciliation.
    }
  }, [hasPendingOperations, setServerSnapshot])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      return
    }

    const channel = new BroadcastChannel(GROUP_EXPANSION_CHANNEL)
    channelRef.current = channel
    channel.onmessage = (event) => {
      const parsed = parseGroupExpansionSnapshot(event.data)
      if (parsed.success && parsed.data.initialized) {
        // Treat the broadcast as an invalidation signal. Mutation responses can
        // arrive out of order across tabs, while a fresh GET always reflects the
        // server's current state. reconcileServerSnapshot also discards older GETs.
        void reconcileServerSnapshot()
      }
    }

    return () => {
      channel.close()
      if (channelRef.current === channel) {
        channelRef.current = null
      }
    }
  }, [reconcileServerSnapshot])

  useEffect(() => {
    const snapshot = preferenceQuery.data
    const navigation = navigationQuery.data
    if (!snapshot || snapshot.initialized || !navigation || initializingRef.current) {
      return
    }

    initializingRef.current = true
    const expandedGroupKeys = deriveLegacyExpandedGroupKeys(
      navigation,
      readLegacyCollapsedGroupKeys()
    )

    void initializeGroupExpansionPreference(expandedGroupKeys)
      .then((initialized) => {
        clearLegacyCollapsedGroupKeys()
        setServerSnapshot(initialized)
        broadcastSnapshot(initialized)
      })
      .catch(() => {
        showToast({
          type: 'error',
          message: messages.serviceGrid.groupPreferenceInitializeFailed,
        })
      })
      .finally(() => {
        initializingRef.current = false
      })
  }, [
    broadcastSnapshot,
    initializeAttempt,
    messages.serviceGrid.groupPreferenceInitializeFailed,
    navigationQuery.data,
    preferenceQuery.data,
    setServerSnapshot,
    showToast,
  ])

  useEffect(() => {
    if (preferenceQuery.data?.initialized) {
      clearLegacyCollapsedGroupKeys()
    }
  }, [preferenceQuery.data?.initialized])

  useEffect(() => {
    if (!preferenceQuery.isError || loadErrorShownRef.current) {
      return
    }
    loadErrorShownRef.current = true
    showToast({
      type: 'error',
      message: messages.serviceGrid.groupPreferenceLoadFailed,
    })
  }, [messages.serviceGrid.groupPreferenceLoadFailed, preferenceQuery.isError, showToast])

  useEffect(() => {
    const refresh = () => {
      if (!hasPendingOperations()) {
        void reconcileServerSnapshot()
      }
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }

    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [hasPendingOperations, reconcileServerSnapshot])

  const setGroupExpanded = useCallback(
    (sceneId: string, groupId: string, expanded: boolean) => {
      const snapshot = queryClient.getQueryData<GroupExpansionSnapshot>(groupExpansionQueryKey)
      if (!snapshot?.initialized) {
        const key = getGroupKey(sceneId, groupId)
        setFallbackKeys((keys) =>
          expanded ? [...new Set([...keys, key])] : keys.filter((item) => item !== key)
        )
        return
      }
      if (pendingSceneDesiredRef.current.has(sceneId)) return

      const key = getGroupKey(sceneId, groupId)
      const rollbackSnapshot = snapshot
      pendingGroupDesiredRef.current.set(key, expanded)
      setPendingGroupKeys((current) => new Set(current).add(key))
      queryClient.setQueryData(
        groupExpansionQueryKey,
        applyGroupExpansion(snapshot, sceneId, groupId, expanded)
      )

      operationIdRef.current += 1
      const operationId = operationIdRef.current
      lastGroupOperationRef.current.set(key, operationId)
      const previous = groupQueueRef.current.get(key) ?? Promise.resolve()
      const operation = previous.then(async () => {
        try {
          const saved = await saveGroupExpansion(sceneId, groupId, expanded)
          const isLatest = lastGroupOperationRef.current.get(key) === operationId
          if (isLatest) {
            pendingGroupDesiredRef.current.delete(key)
            confirmedDesiredRef.current.set(key, expanded)
            setPendingGroupKeys((current) => {
              const next = new Set(current)
              next.delete(key)
              return next
            })
          }
          setServerSnapshot(saved)
          broadcastSnapshot(saved)
          void reconcileServerSnapshot()
        } catch {
          const isLatest = lastGroupOperationRef.current.get(key) === operationId
          if (isLatest) {
            pendingGroupDesiredRef.current.delete(key)
            setPendingGroupKeys((current) => {
              const next = new Set(current)
              next.delete(key)
              return next
            })
            setServerSnapshot(rollbackSnapshot)
            showToast({
              type: 'error',
              message: messages.serviceGrid.groupPreferenceSaveFailed,
            })
            void reconcileServerSnapshot()
          }
        }
      })

      groupQueueRef.current.set(key, operation)
      void operation.finally(() => {
        if (groupQueueRef.current.get(key) === operation) {
          groupQueueRef.current.delete(key)
        }
      })
    },
    [
      broadcastSnapshot,
      messages.serviceGrid.groupPreferenceSaveFailed,
      queryClient,
      reconcileServerSnapshot,
      setServerSnapshot,
      showToast,
    ]
  )

  const setSceneGroupsExpanded = useCallback(
    async (sceneId: string, expanded: boolean) => {
      const navigation = navigationRef.current
      const snapshot = queryClient.getQueryData<GroupExpansionSnapshot>(groupExpansionQueryKey)
      const scene = navigation?.scenes.find((item) => item.id === sceneId)
      if (!snapshot?.initialized || !navigation || !scene) {
        return false
      }
      if (
        pendingSceneDesiredRef.current.has(sceneId) ||
        scene.groups.some((group) =>
          pendingGroupDesiredRef.current.has(getGroupKey(sceneId, group.id))
        )
      ) {
        return false
      }

      const rollbackSnapshot = snapshot
      pendingSceneDesiredRef.current.set(sceneId, expanded)
      setPendingSceneIds((current) => new Set(current).add(sceneId))
      queryClient.setQueryData(
        groupExpansionQueryKey,
        applySceneGroupExpansion(snapshot, navigation, sceneId, expanded)
      )

      try {
        const saved = await saveSceneGroupExpansion(sceneId, expanded)
        pendingSceneDesiredRef.current.delete(sceneId)
        scene.groups.forEach((group) => {
          confirmedDesiredRef.current.set(getGroupKey(sceneId, group.id), expanded)
        })
        setServerSnapshot(saved)
        broadcastSnapshot(saved)
        void reconcileServerSnapshot()
        return true
      } catch {
        pendingSceneDesiredRef.current.delete(sceneId)
        setServerSnapshot(rollbackSnapshot)
        showToast({
          type: 'error',
          message: messages.serviceGrid.groupPreferenceSaveFailed,
        })
        void reconcileServerSnapshot()
        return false
      } finally {
        setPendingSceneIds((current) => {
          const next = new Set(current)
          next.delete(sceneId)
          return next
        })
      }
    },
    [
      broadcastSnapshot,
      messages.serviceGrid.groupPreferenceSaveFailed,
      queryClient,
      reconcileServerSnapshot,
      setServerSnapshot,
      showToast,
    ]
  )

  const isGroupPending = useCallback(
    (sceneId: string, groupId: string) =>
      pendingSceneIds.has(sceneId) || pendingGroupKeys.has(getGroupKey(sceneId, groupId)),
    [pendingGroupKeys, pendingSceneIds]
  )
  const isScenePending = useCallback(
    (sceneId: string) => {
      const scene = navigationRef.current?.scenes.find((item) => item.id === sceneId)
      return (
        pendingSceneIds.has(sceneId) ||
        Boolean(scene?.groups.some((group) => pendingGroupKeys.has(getGroupKey(sceneId, group.id))))
      )
    },
    [pendingGroupKeys, pendingSceneIds]
  )

  const expandedGroupKeys = useMemo(
    () =>
      new Set(
        preferenceQuery.data?.initialized ? preferenceQuery.data.expandedGroupKeys : fallbackKeys
      ),
    [preferenceQuery.data, fallbackKeys]
  )
  const isReady = Boolean(preferenceQuery.data?.initialized)
  const refetchPreference = preferenceQuery.refetch
  const retry = useCallback(() => {
    loadErrorShownRef.current = false
    setInitializeAttempt((attempt) => attempt + 1)
    void refetchPreference()
  }, [refetchPreference])
  const contextValue = useMemo(
    () => ({
      expandedGroupKeys,
      isReady,
      retry,
      isGroupPending,
      isScenePending,
      setGroupExpanded,
      setSceneGroupsExpanded,
    }),
    [
      expandedGroupKeys,
      isGroupPending,
      isReady,
      retry,
      isScenePending,
      setGroupExpanded,
      setSceneGroupsExpanded,
    ]
  )

  return (
    <GroupExpansionContext.Provider value={contextValue}>{children}</GroupExpansionContext.Provider>
  )
}
