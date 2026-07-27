'use client'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export type SidebarNavItem = {
  href: string
  label: string
  active: boolean
  icon: React.ReactNode
  /**
   * Anchor id for the guided tour (components/tour). Emitted as `data-tour`.
   * These live in the layout, which is why the tour can change route without
   * ever losing the element it is pointing at.
   */
  tourId?: string
}

export function SidebarNav({
  items,
  collapsed,
}: {
  items: SidebarNavItem[]
  collapsed: boolean
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', collapsed ? 'items-center px-3' : 'px-3')}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          prefetch={true}
          data-tour={item.tourId}
          // Collapsed rows have no text, so the accessible name comes from
          // title/aria-label instead.
          title={collapsed ? item.label : undefined}
          aria-label={collapsed ? item.label : undefined}
          className={cn(
            'flex items-center rounded-[10px] text-[13.5px]',
            collapsed ? 'h-10 w-10 justify-center' : 'gap-3 px-3 py-2.5',
            item.active
              ? 'bg-brand-soft font-semibold text-brand'
              : 'text-muted-foreground hover:bg-hoverrow hover:text-foreground',
          )}
        >
          <span className="flex h-[18px] w-[18px] flex-none items-center justify-center">
            {item.icon}
          </span>
          {!collapsed && <span className="truncate">{item.label}</span>}
        </Link>
      ))}
    </div>
  )
}
