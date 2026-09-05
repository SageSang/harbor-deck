import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AppConfig } from '@/config/schema'
import {
  ApiError,
  appConfigQueryKey,
  saveAppConfig,
  navigationConfigQueryKey,
  sceneListQueryKey,
  systemConfigQueryKey,
} from '@/features/config/api'

export function useSaveAppConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: AppConfig) => saveAppConfig(config),
    onSuccess: (savedConfig) => {
      queryClient.setQueryData(appConfigQueryKey, savedConfig)
      queryClient.setQueryData(systemConfigQueryKey, savedConfig.system)
      void queryClient.invalidateQueries({ queryKey: navigationConfigQueryKey })
      void queryClient.invalidateQueries({ queryKey: sceneListQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['navigation', 'services'] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 412) {
        void queryClient.invalidateQueries({ queryKey: appConfigQueryKey })
        void queryClient.invalidateQueries({ queryKey: navigationConfigQueryKey })
        void queryClient.invalidateQueries({ queryKey: ['navigation', 'services'] })
      }
    },
  })
}
