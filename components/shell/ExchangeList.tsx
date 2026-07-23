'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { setActiveExchange } from '@/actions/session'
import { exchangeDotColor } from '@/lib/shell/exchange-color'
import { cn } from '@/lib/utils'
import type { ExchangeOption } from './OrganizerShell'

export function ExchangeList({
  exchanges,
  activeId,
  collapsed,
  onNewExchange,
}: {
  exchanges: ExchangeOption[]
  activeId: string | null
  collapsed: boolean
  onNewExchange: () => void
}) {
  const t = useTranslations('organizer')
  const router = useRouter()
  const pathname = usePathname()

  async function select(id: string) {
    if (id === activeId) return
    // setActiveExchange revalidates the whole tree; the action response already
    // re-renders the current page, so only navigate if we are not on it.
    await setActiveExchange(id)
    if (pathname !== '/dashboard') router.push('/dashboard')
  }

  return (
    <div className="border-t pt-3.5">
      <div
        className={cn(
          'flex items-center px-3',
          collapsed ? 'justify-center' : 'justify-between pl-6 pr-3',
        )}
      >
        {!collapsed && (
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[.08em] text-tertiary">
            {t('shell.exchangeGroup.title')}
          </span>
        )}
        <button
          type="button"
          onClick={onNewExchange}
          title={collapsed ? t('shell.exchangeGroup.add') : undefined}
          aria-label={t('shell.exchangeGroup.add')}
          className={cn(
            'rounded-pill text-[11.5px] font-semibold text-brand hover:bg-brand-soft',
            collapsed ? 'flex h-7 w-7 items-center justify-center text-base' : 'px-2.5 py-1',
          )}
        >
          {collapsed ? '+' : t('shell.exchangeGroup.add')}
        </button>
      </div>

      <div className={cn('mt-1.5 flex flex-col gap-0.5 px-3', collapsed && 'items-center')}>
        {exchanges.length === 0 && !collapsed && (
          <p className="px-3 py-2 text-[12.5px] text-tertiary">
            {t('shell.exchangeGroup.empty')}
          </p>
        )}
        {exchanges.map((ex) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => select(ex.id)}
            title={collapsed ? ex.name : undefined}
            aria-label={collapsed ? ex.name : undefined}
            aria-current={ex.id === activeId ? 'true' : undefined}
            className={cn(
              'flex items-center rounded-[10px] text-[13px]',
              collapsed ? 'h-10 w-10 justify-center' : 'w-full gap-2.5 px-3 py-2 text-left',
              ex.id === activeId
                ? 'bg-subtle font-semibold text-foreground'
                : 'text-muted-foreground hover:bg-hoverrow hover:text-foreground',
            )}
          >
            <span
              aria-hidden
              className="h-[9px] w-[9px] flex-none rounded-full"
              style={{ background: exchangeDotColor(ex.id) }}
            />
            {!collapsed && <span className="min-w-0 flex-1 truncate">{ex.name}</span>}
            {!collapsed && ex.archived && (
              <span className="flex-none rounded-pill bg-subtle px-2 py-px font-mono text-[10px] font-semibold text-muted-foreground">
                {t('shell.archivedBadge')}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
