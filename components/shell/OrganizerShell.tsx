'use client'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Mark } from '@/components/brand/Mark'
import { IconOverview, IconApplications, IconForms, IconStudents, IconSettings, IconFeedbackLight, IconCommunication } from './RailIcons'
import { SidebarNav, type SidebarNavItem } from './SidebarNav'
import { ExchangeList } from './ExchangeList'
import { useSidebarCollapsed } from './useSidebarCollapsed'
import { NewExchangeModal } from './NewExchangeModal'
import { useDismissable } from './useDismissable'
import { FeedbackModal } from './FeedbackModal'
import { ShellUiContext, type ShellUi } from './ShellUiContext'
import { TourProvider } from '@/components/tour/TourProvider'
import { TourMenuItem } from '@/components/tour/TourMenuItem'
import { NotificationsMenu } from './NotificationsMenu'
import { badgeCount, buildNotificationGroups, newestNotificationAt, type NotificationRow } from '@/lib/shell/notifications'
import type { TourState } from '@/types/db'

export type ExchangeOption = { id: string; name: string; year: number; archived: boolean }

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

function NewExchangeAutoOpen({ onOpen }: { onOpen: () => void }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    if (searchParams.get('new-exchange') === '1') {
      onOpen()
      router.replace(pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  return null
}

export function OrganizerShell({
  exchanges,
  activeExchangeId,
  organizerName,
  schoolName,
  atCap = false,
  isTrial = false,
  remaining = Infinity,
  orgRole = 'admin',
  // Defaults to 'completed' so the many existing shell tests (and any caller
  // that does not care) never render the invitation card.
  tourState = 'completed',
  notifications = [],
  children,
}: {
  exchanges: ExchangeOption[]
  activeExchangeId: string | null
  organizerName: string
  schoolName: string
  atCap?: boolean
  isTrial?: boolean
  remaining?: number
  orgRole?: 'owner' | 'admin'
  tourState?: TourState
  notifications?: NotificationRow[]
  children: React.ReactNode
}) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const pathname = usePathname()
  const router = useRouter()
  // One state, not two booleans: opening either header menu must close the other.
  const [openMenu, setOpenMenu] = useState<'account' | 'notifications' | null>(null)
  const menuOpen = openMenu === 'account'
  const [newExchangeOpen, setNewExchangeOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const active = exchanges.find((e) => e.id === activeExchangeId) ?? exchanges[0] ?? null
  const closeMenu = useCallback(() => setOpenMenu(null), [])
  const menuRef = useDismissable<HTMLDivElement>(menuOpen, closeMenu)
  const { collapsed, toggle } = useSidebarCollapsed()

  const isSettings = pathname.startsWith('/settings')

  // Every "+ Nouvel échange" affordance routes through this. At the plan's
  // exchange cap we redirect straight to /billing instead of opening the modal
  // (createExchange would only return an { error: 'limit' } result anyway).
  const handleNewExchange = useCallback(() => {
    if (atCap) {
      router.push('/billing?reason=limit')
      return
    }
    setNewExchangeOpen(true)
  }, [atCap, router])

  const shellUi = useMemo<ShellUi>(() => ({
    openNewExchange: handleNewExchange,
  }), [handleNewExchange])

  const notificationGroups = useMemo(
    () => buildNotificationGroups(notifications, exchanges),
    [notifications, exchanges],
  )
  const notificationBadge = useMemo(() => badgeCount(notifications), [notifications])
  // Drives the bell's "already looked at" comparison — see newestNotificationAt.
  const notificationNewestAt = useMemo(() => newestNotificationAt(notifications), [notifications])

  // Session-scoped tabs only exist once there is an exchange to scope them to.
  const navItems: SidebarNavItem[] = [
    { href: '/dashboard', label: t('shell.nav.dashboard'), active: pathname === '/dashboard', icon: <IconOverview />, tourId: 'nav-dashboard' },
    ...(active
      ? [
          { href: '/applications', label: t('shell.nav.applications'), active: pathname.startsWith('/applications'), icon: <IconApplications />, tourId: 'nav-applications' },
          { href: '/forms', label: t('shell.nav.files'), active: pathname.startsWith('/forms') || pathname.startsWith('/documents'), icon: <IconForms />, tourId: 'nav-files' },
          { href: '/students', label: t('shell.nav.students'), active: pathname.startsWith('/students'), icon: <IconStudents />, tourId: 'nav-students' },
          { href: '/communication', label: t('shell.nav.communication'), active: pathname.startsWith('/communication'), icon: <IconCommunication />, tourId: 'nav-communication' },
        ]
      : []),
  ]

  const settingsItem: SidebarNavItem[] = [
    { href: '/settings', label: t('shell.accountMenu.settings'), active: isSettings, icon: <IconSettings />, tourId: 'nav-settings' },
  ]

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <TourProvider initialState={tourState}>
    <div className="flex h-screen overflow-hidden bg-background">
      <Suspense fallback={null}>
        <NewExchangeAutoOpen onOpen={handleNewExchange} />
      </Suspense>

      <nav
        data-noprint
        className={cn(
          'flex flex-none flex-col overflow-y-auto border-r bg-card py-4 transition-[width] duration-200',
          collapsed ? 'w-[68px]' : 'w-[250px]'
        )}
      >
        <div className={cn('mb-5 flex items-center gap-2', collapsed ? 'justify-center px-3' : 'px-6')}>
          <Mark className="h-[19px] w-[26px] flex-none" />
          {!collapsed && (
            <span className="font-display text-[15px] font-bold tracking-tight text-navy">
              EazyExchange
            </span>
          )}
        </div>

        <SidebarNav items={navItems} collapsed={collapsed} />

        <div className="mt-4">
          <ExchangeList
            exchanges={exchanges}
            activeId={active?.id ?? null}
            collapsed={collapsed}
            onNewExchange={handleNewExchange}
          />
        </div>

        <div className="flex-1" />

        <div className="border-t pt-3">
          <SidebarNav items={settingsItem} collapsed={collapsed} />
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? t('shell.sidebar.expand') : t('shell.sidebar.collapse')}
            title={collapsed ? t('shell.sidebar.expand') : t('shell.sidebar.collapse')}
            className={cn(
              'mt-0.5 flex items-center rounded-[10px] text-[13.5px] text-muted-foreground hover:bg-hoverrow hover:text-foreground',
              collapsed ? 'mx-auto h-10 w-10 justify-center' : 'mx-3 gap-3 px-3 py-2.5'
            )}
          >
            <span className="flex h-[18px] w-[18px] flex-none items-center justify-center">
              {collapsed
                ? <ChevronsRightIcon aria-hidden size={18} strokeWidth={1.75} />
                : <ChevronsLeftIcon aria-hidden size={18} strokeWidth={1.75} />}
            </span>
            {!collapsed && <span>{t('shell.sidebar.collapse')}</span>}
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-noprint className="flex h-[66px] flex-none items-center justify-between gap-5 border-b bg-card px-7">
          <div className="flex items-center gap-3.5">
            {isSettings ? (
              <span className="font-display text-base font-semibold text-navy">{schoolName}</span>
            ) : active ? (
              <>
                <span className="font-display text-base font-semibold text-navy">{active.name}</span>
                {active.archived && (
                  <span className="rounded-pill bg-subtle px-3 py-1 font-mono text-[11px] font-semibold text-muted-foreground">
                    {t('shell.archivedBadge')}
                  </span>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={handleNewExchange}
                className="flex h-[38px] items-center gap-1.5 rounded-[9px] bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-hover"
              >
                {c('actions.newExchange')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="flex h-[38px] items-center gap-2 rounded-[9px] border px-3.5 text-[13px] font-medium text-muted-foreground hover:bg-hoverrow hover:text-foreground"
            >
              <IconFeedbackLight />
              <span>{t('shell.nav.feedback')}</span>
            </button>
            <NotificationsMenu
              groups={notificationGroups}
              badge={notificationBadge}
              newestAt={notificationNewestAt}
              open={openMenu === 'notifications'}
              onOpenChange={(next) => setOpenMenu(next ? 'notifications' : null)}
            />
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setOpenMenu((m) => (m === 'account' ? null : 'account'))}
                aria-label={t('shell.accountMenu.trigger')}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-subtle font-mono text-[11px] font-semibold text-navy hover:bg-hoverrow"
              >
                {initials(organizerName)}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-30 mt-2 w-44 rounded-[11px] border bg-card p-1 shadow-float">
                  <TourMenuItem onStarted={() => setOpenMenu(null)} />
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full rounded-[8px] px-3 py-2 text-left text-sm text-foreground hover:bg-hoverrow"
                  >
                    {t('shell.accountMenu.signOut')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto px-7 pb-10 pt-[26px]">
          <div className="mx-auto max-w-6xl">
            <ShellUiContext.Provider value={shellUi}>
              {children}
            </ShellUiContext.Provider>
          </div>
        </main>
      </div>
      <NewExchangeModal
        open={newExchangeOpen}
        onOpenChange={setNewExchangeOpen}
        isTrial={isTrial}
        remaining={remaining}
        isOwner={orgRole === 'owner'}
      />
      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </div>
    </TourProvider>
  )
}
