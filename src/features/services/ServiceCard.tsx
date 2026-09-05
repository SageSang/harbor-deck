import { forwardRef, type HTMLAttributes } from 'react'
import { resolveTargetUrl } from '@/core/navigation/resolveTargetUrl'
import type { NetworkMode } from '@/core/network/detectNetworkMode'
import type { OpenTarget, Service } from '@/config/schema'
import { cn } from '@/lib/utils'
import { getPreferredBookmarkCopyUrl } from './bookmarkUrl'
import { ServiceIcon } from './ServiceIcon'

interface ServiceCardProps extends HTMLAttributes<HTMLAnchorElement> {
  service: Service
  networkMode: NetworkMode
  clickOpenTarget: OpenTarget
  middleClickOpenTarget: OpenTarget
  isDragging?: boolean
  isDropTarget?: boolean
}

export const ServiceCard = forwardRef<HTMLAnchorElement, ServiceCardProps>(function ServiceCard(
  {
    service,
    networkMode,
    clickOpenTarget,
    middleClickOpenTarget,
    className,
    isDragging,
    isDropTarget,
    onClick,
    onMouseDown,
    ...props
  },
  ref
) {
  const urls = resolveTargetUrl(service, networkMode)
  const target = service.forceNewTab || clickOpenTarget === 'blank' ? '_blank' : '_self'
  const handleMouseDown: HTMLAttributes<HTMLAnchorElement>['onMouseDown'] = (event) => {
    onMouseDown?.(event)
    if (event.button === 1 && middleClickOpenTarget === 'self' && !service.forceNewTab)
      event.preventDefault()
  }

  const cardTitle = [service.name, getPreferredBookmarkCopyUrl(service)].filter(Boolean).join('\n')

  return (
    <a
      ref={ref}
      href={urls.primary}
      target={target}
      rel="noopener noreferrer"
      className={cn(
        'group relative block h-full cursor-pointer overflow-hidden rounded-[1.08rem] border border-border/80 bg-card/90 px-3 py-2 shadow-[0_8px_18px_rgba(15,23,42,0.07)] backdrop-blur-none transition-[transform,border-color,background-color,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card hover:shadow-[0_12px_24px_rgba(15,23,42,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 dark:bg-card/80 dark:shadow-[0_12px_26px_rgba(0,0,0,0.25)] dark:hover:shadow-[0_16px_32px_rgba(0,0,0,0.3)]',
        isDragging && 'cursor-grabbing opacity-45 shadow-none',
        isDropTarget && 'border-primary/50 ring-2 ring-primary/15',
        className
      )}
      title={cardTitle}
      onClick={onClick}
      onMouseDown={handleMouseDown}
      onAuxClick={(event) => {
        if (
          event.button === 1 &&
          middleClickOpenTarget === 'self' &&
          !service.forceNewTab &&
          !event.defaultPrevented
        ) {
          event.preventDefault()
          window.location.assign(urls.primary)
        }
      }}
      {...props}
    >
      <div className="pointer-events-none absolute inset-x-3 top-0 h-10 rounded-b-[999px] bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_72%)] opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative grid min-h-[62px] grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 pl-0.5">
        <div className="flex h-[1.72rem] w-[1.72rem] shrink-0 items-center justify-center rounded-[0.8rem] border border-border/70 bg-background/92 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_8px_18px_hsl(var(--primary)/0.1)] transition-transform duration-300 group-hover:scale-[1.03] group-hover:border-primary/25 group-hover:bg-background">
          <ServiceIcon name={service.icon} className="h-3 w-3" autoLoad={false} />
        </div>
        <div className="flex min-h-[3rem] min-w-0 items-center justify-start pr-4">
          <div className="w-full min-w-0 overflow-hidden text-left text-[12px] font-semibold leading-[1.28] text-foreground/95 break-words sm:text-[12.5px] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
            {service.name}
          </div>
        </div>
      </div>
    </a>
  )
})

ServiceCard.displayName = 'ServiceCard'
