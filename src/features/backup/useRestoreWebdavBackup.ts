import { authStatusQueryKey } from '@/features/auth/api'
import { useAppStore } from '@/store/appStore'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  appConfigQueryKey,
  navigationConfigQueryKey,
  sceneListQueryKey,
  systemConfigQueryKey,
} from '@/features/config/api'
import { restoreWebdavBackup, webdavBackupVersionsQueryKey } from './api'

export function useRestoreWebdavBackup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (versionId: string) => restoreWebdavBackup(versionId),
    onMutate: () => ({ accessVersion: useAppStore.getState().sceneAccessVersion }),
    onSuccess: (result, _versionId, context) => {
      if (context?.accessVersion !== useAppStore.getState().sceneAccessVersion) return
      useAppStore.getState().clearSceneTokens()
      if (!result.requiresReauth) {
        queryClient.setQueryData(appConfigQueryKey, result.restoredConfig)
        queryClient.setQueryData(systemConfigQueryKey, result.restoredConfig.system)
      } else {
        queryClient.removeQueries({ queryKey: appConfigQueryKey })
        queryClient.removeQueries({ queryKey: systemConfigQueryKey })
        void queryClient.invalidateQueries({ queryKey: authStatusQueryKey })
      }
      void queryClient.invalidateQueries({ queryKey: navigationConfigQueryKey })
      void queryClient.invalidateQueries({ queryKey: sceneListQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['navigation', 'services'] })
      void queryClient.invalidateQueries({
        queryKey: webdavBackupVersionsQueryKey,
      })
    },
  })
}
