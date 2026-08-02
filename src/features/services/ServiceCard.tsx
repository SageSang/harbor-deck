import type { HTMLAttributes } from 'react'
import { Card } from '@/components/ui/card'
import { resolveTargetUrl } from '@/core/navigation/resolveTargetUrl'
import { openWithFallback } from '@/core/navigation/openWithFallback'
import type { NetworkMode } from '@/core/network/detectNetworkMode'
import type { OpenTarget, Service } from '@/config/schema'
import { cn } from '@/lib/utils'
import { ServiceIcon } from './ServiceIcon'

interface ServiceCardProps extends HTMLAttributes<HTMLDivElement> {
  service: Service
  networkMode: NetworkMode
  clickOpenTarget: OpenTarget
  middleClickOpenTarget: OpenTarget
  isDragging?: boolean
  isDropTarget?: boolean
}

export function ServiceCard({
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
}: ServiceCardProps) {
  async function openService(target: OpenTarget) {
    const urls = resolveTargetUrl(service, networkMode)
    const openTarget = service.forceNewTab ? 'blank' : target
    await openWithFallback(urls, { target: openTarget })
  }

  const handleClick: HTMLAttributes<HTMLDivElement>['onClick'] = async (event) => {
    onClick?.(event)

    if (event?.defaultPrevented) {
      return
    }

    await openService(clickOpenTarget)
  }

  const handleMouseDown: HTMLAttributes<HTMLDivElement>['onMouseDown'] = (event) => {
    onMouseDown?.(event)

    if (event.defaultPrevented || event.button !== 1) {
      return
    }

    event.preventDefault()
    void openService(middleClickOpenTarget)
  }

  return (
    <Card
      className={cn(
        'group relative h-full cursor-pointer overflow-hidden rounded-[1.08rem] border border-border/80 bg-card/90 px-3 py-1.5 shadow-[0_12px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card hover:shadow-[0_16px_32px_rgba(15,23,42,0.12)] dark:bg-card/80 dark:shadow-[0_16px_34px_rgba(0,0,0,0.3)] dark:hover:shadow-[0_20px_40px_rgba(0,0,0,0.34)]',
        isDragging && 'cursor-grabbing opacity-45 shadow-none',
        isDropTarget && 'border-primary/50 ring-2 ring-primary/15',
        className
      )}
      title={service.name}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      {...props}
    >
      <div className="pointer-events-none absolute inset-x-3 top-0 h-10 rounded-b-[999px] bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_72%)] opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative grid min-h-[54px] grid-cols-[auto_minmax(0,1fr)] items-center gap-2 pl-0.5">
        <div className="flex h-[1.72rem] w-[1.72rem] shrink-0 items-center justify-center rounded-[0.8rem] border border-border/70 bg-background/92 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_8px_18px_hsl(var(--primary)/0.1)] transition-transform duration-300 group-hover:scale-[1.03] group-hover:border-primary/25 group-hover:bg-background">
          <ServiceIcon name={service.icon} className="h-3 w-3" autoLoad={false} />
        </div>
        <div className="flex min-h-[2rem] min-w-0 items-center justify-start pr-0.5">
          <div className="w-full min-w-0 overflow-hidden text-left text-[12px] font-semibold leading-[1.28] text-foreground/95 break-words sm:text-[12.5px] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
            {service.name}
          </div>
        </div>
      </div>
    </Card>
  )
}
