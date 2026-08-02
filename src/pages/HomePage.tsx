import { useEffect, useMemo } from 'react'
import { HeroClock } from '@/components/HeroClock'
import { SearchBox } from '@/components/SearchBox'
import { TopBar } from '@/components/TopBar'
import { ServiceGrid } from '@/features/services/ServiceGrid'
import { useI18n } from '@/i18n/runtime'
import { useAppStore } from '@/store/appStore'
import { useSystemConfig } from '@/features/config/useSystemConfig'
import { useServices } from '@/features/services/useServices'
import { detectNetworkMode } from '@/core/network/detectNetworkMode'
import { useNavigationConfig } from '@/features/navigation/useNavigation'

export function HomePage() {
  const networkModeStrategy = useAppStore((state) => state.networkModeStrategy)
  const setDetectedNetworkMode = useAppStore((state) => state.setDetectedNetworkMode)
  const error = useAppStore((state) => state.error)
  const { allServices } = useServices()
  const navigationQuery = useNavigationConfig()
  const { data: systemConfig } = useSystemConfig()
  const { messages } = useI18n()
  const networkProbeServices = useMemo(
    () =>
      navigationQuery.data?.bookmarks.map((bookmark) => ({ ...bookmark, category: 'all' })) ??
      allServices,
    [allServices, navigationQuery.data]
  )

  useEffect(() => {
    let cancelled = false

    if (networkModeStrategy === 'manual') {
      return () => {
        cancelled = true
      }
    }

    void detectNetworkMode(networkProbeServices, systemConfig?.networkProbe).then((mode) => {
      if (!cancelled) {
        setDetectedNetworkMode(mode)
      }
    })

    return () => {
      cancelled = true
    }
  }, [networkModeStrategy, networkProbeServices, setDetectedNetworkMode, systemConfig?.networkProbe])

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <TopBar />
      <main className="relative z-10 container mx-auto max-w-[92rem] px-2.5 pt-3 pb-5 sm:px-4 md:px-5 md:pt-4 md:pb-7 lg:px-6">
        <section className="mx-auto flex w-full max-w-[46rem] flex-col items-center py-1 text-center md:py-1.5">
          <HeroClock />
          <div className="mt-2 w-full animate-slide-up [animation-delay:220ms] md:mt-2.5">
            <SearchBox />
          </div>
        </section>

        {error && (
          <div className="mx-auto mb-5 max-w-2xl rounded-[1.35rem] border border-red-200/80 bg-red-50/96 p-5 shadow-[0_16px_36px_rgba(220,38,38,0.08)] backdrop-blur-sm md:p-6">
            <p className="text-lg font-semibold text-red-900">{messages.home.errorTitle}</p>
            <p className="mt-1 text-sm leading-relaxed text-red-700">{error}</p>
          </div>
        )}

        <div className="mt-1.5 md:mt-2">
          <ServiceGrid />
        </div>
      </main>
    </div>
  )
}
