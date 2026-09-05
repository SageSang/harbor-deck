import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AppConfig, SystemConfig } from '@/config/schema'
import {
  ApiError,
  appConfigQueryKey,
  saveSystemConfig,
  systemConfigQueryKey,
} from '@/features/config/api'

export function useSaveSystemConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: SystemConfig) => saveSystemConfig(config),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 412) {
        void queryClient.invalidateQueries({ queryKey: systemConfigQueryKey })
      }
    },
    onSuccess: (savedConfig) => {
      queryClient.setQueryData(systemConfigQueryKey, savedConfig)
      queryClient.setQueryData(appConfigQueryKey, (currentConfig: AppConfig | undefined) => {
        if (!currentConfig) {
          return currentConfig
        }

        return {
          ...currentConfig,
          system: savedConfig,
        }
      })
    },
  })
}
