import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AppConfig } from '@/config/schema'
import {
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
      queryClient.setQueryData(navigationConfigQueryKey, savedConfig.navigation)
      void queryClient.invalidateQueries({ queryKey: sceneListQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['navigation', 'services'] })
    },
  })
}
