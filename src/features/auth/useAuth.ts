import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  appConfigQueryKey,
  navigationConfigQueryKey,
  sceneListQueryKey,
  systemConfigQueryKey,
} from '@/features/config/api'
import {
  authStatusQueryKey,
  fetchAuthStatus,
  login,
  logout,
  setup,
  updateCredentials,
  type AuthStatus,
  type LoginPayload,
  type UpdateCredentialsPayload,
} from './api'

function clearProtectedQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.removeQueries({ queryKey: appConfigQueryKey })
  queryClient.removeQueries({ queryKey: systemConfigQueryKey })
  queryClient.removeQueries({ queryKey: navigationConfigQueryKey })
  queryClient.removeQueries({ queryKey: sceneListQueryKey })
  queryClient.removeQueries({ queryKey: ['navigation', 'services'] })
}

export function useAuthStatus() {
  return useQuery({
    queryKey: authStatusQueryKey,
    queryFn: fetchAuthStatus,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

function setAuthenticatedStatus(
  queryClient: ReturnType<typeof useQueryClient>,
  status: AuthStatus
) {
  queryClient.setQueryData(authStatusQueryKey, status)
}

export function useLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: LoginPayload) => login(payload),
    onSuccess: (status) => {
      clearProtectedQueries(queryClient)
      setAuthenticatedStatus(queryClient, status)
    },
  })
}

export function useSetupAuth() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: LoginPayload) => setup(payload),
    onSuccess: (status) => {
      clearProtectedQueries(queryClient)
      setAuthenticatedStatus(queryClient, status)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      clearProtectedQueries(queryClient)
      setAuthenticatedStatus(queryClient, {
        setupRequired: false,
        authenticated: false,
      })
    },
  })
}

export function useUpdateCredentials() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: UpdateCredentialsPayload) => updateCredentials(payload),
    onSuccess: (status) => {
      clearProtectedQueries(queryClient)
      setAuthenticatedStatus(queryClient, status)
    },
  })
}
