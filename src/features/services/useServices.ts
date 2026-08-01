import { useEffect, useMemo } from 'react'
import { getCurrentMessages } from '@/i18n/runtime'
import { useAppStore } from '@/store/appStore'
import { normalizeServicesConfig } from '@/features/services/servicesConfig'
import { useActiveSceneServices } from '@/features/navigation/useNavigation'

export function useServicesConfig() {
  const setError = useAppStore((state) => state.setError)
  const query = useActiveSceneServices()

  useEffect(() => {
    if (!query.error) {
      setError(null)
      return
    }
    const fallbackMessage = getCurrentMessages().common.invalidContentRetry
    setError(query.error instanceof Error ? query.error.message : fallbackMessage)
  }, [query.error, setError])

  return query
}

export function useServices() {
  const searchKeyword = useAppStore((state) => state.searchKeyword)
  const query = useServicesConfig()

  const keyword = searchKeyword.trim().toLowerCase()

  const allGroupedServices = useMemo(() => {
    if (!query.data) {
      return []
    }

    return normalizeServicesConfig(query.data)
  }, [query.data])

  const groupedServices = useMemo(() => {
    return allGroupedServices
      .map((group) => {
        const matchCategory = keyword ? group.category.toLowerCase().includes(keyword) : false
        const services = keyword
          ? group.services.filter((service) => {
              if (matchCategory) {
                return true
              }

              return (
                service.name.toLowerCase().includes(keyword) ||
                service.slug.toLowerCase().includes(keyword)
              )
            })
          : group.services

        return {
          category: group.category,
          services,
        }
      })
      .filter((group) => (keyword ? group.services.length > 0 : true))
  }, [allGroupedServices, keyword])

  const allServices = allGroupedServices.flatMap((group) => group.services)

  return {
    services: groupedServices.flatMap((group) => group.services),
    allServices,
    groupedServices,
    config: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
