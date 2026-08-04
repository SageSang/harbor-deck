import { useEffect, useSyncExternalStore, type ComponentType } from 'react'
import { Box } from 'lucide-react'
import {
  getCachedIconComponent,
  getIconCacheSnapshot,
  loadIconComponent,
  notifyIconLoaded,
  resolveIconLoaderKey,
  subscribeIconCache,
} from './iconRegistry'

interface ServiceIconProps {
  name?: string
  className?: string
  autoLoad?: boolean
}

type IconComponent = ComponentType<{
  className?: string
}>

type CachedServiceIconProps = {
  loaderKey: ReturnType<typeof resolveIconLoaderKey>
  className?: string
}

function CachedServiceIcon({ loaderKey, className }: CachedServiceIconProps) {
  const Icon: IconComponent = getCachedIconComponent(loaderKey) ?? Box

  return <Icon className={className} />
}

function AutoLoadingServiceIcon({ loaderKey, className }: CachedServiceIconProps) {
  useSyncExternalStore(subscribeIconCache, getIconCacheSnapshot, getIconCacheSnapshot)

  useEffect(() => {
    if (loaderKey === 'box' || getCachedIconComponent(loaderKey)) {
      return
    }

    let cancelled = false

    void loadIconComponent(loaderKey).then(() => {
      if (!cancelled) {
        notifyIconLoaded()
      }
    })

    return () => {
      cancelled = true
    }
  }, [loaderKey])

  return <CachedServiceIcon loaderKey={loaderKey} className={className} />
}

export function ServiceIcon({ name, className, autoLoad = true }: ServiceIconProps) {
  const loaderKey = resolveIconLoaderKey(name)

  return autoLoad ? (
    <AutoLoadingServiceIcon loaderKey={loaderKey} className={className} />
  ) : (
    <CachedServiceIcon loaderKey={loaderKey} className={className} />
  )
}
