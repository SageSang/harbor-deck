import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSystemConfig, systemConfigQueryKey, defaultSystemConfig } from './api'
import { useNavigationView } from '@/features/navigation/navigationView'
import { snapshotDisplay } from '@shared/bookmarkSnapshot'
import { updateBookmarkPresentation } from '@/features/navigation/bookmarkCache'

export function useSystemConfig() {
  const view = useNavigationView()
  const query = useQuery({
    queryKey: systemConfigQueryKey,
    queryFn: fetchSystemConfig,
    enabled: view.authenticated,
    staleTime: 60_000,
    retry: false,
    networkMode: 'always',
    refetchOnWindowFocus: false,
  })
  const cached = useMemo(
    () => ({ ...defaultSystemConfig, ...view.snapshot?.display }),
    [view.snapshot?.display]
  )
  const hasSnapshot = Boolean(view.snapshot)
  useEffect(() => {
    // Publish server changes (or populate a newly available cache), not cache
    // notifications: another tab may have cached newer settings than this query.
    if (query.data && hasSnapshot)
      updateBookmarkPresentation({ display: snapshotDisplay(query.data) })
  }, [query.data, hasSnapshot])
  return { ...query, data: query.data ?? cached }
}
