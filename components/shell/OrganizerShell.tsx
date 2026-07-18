'use client'
import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Mark } from '@/components/brand/Mark'
import { IconOverview, IconApplications, IconForms, IconStudents, IconSettings, IconFeedbackLight } from './RailIcons'
import { SessionSelector } from './SessionSelector'
import { NewExchangeModal } from './NewExchangeModal'
import { FeedbackModal } from './FeedbackModal'
import { ShellUiContext, type ShellUi } from './ShellUiContext'

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

function RailItem({
  href,
  label,
  active,
  children,
}: {
  href: string
  label: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      prefetch={true}
      className={cn(
        'flex w-[62px] flex-col items-center gap-1.5 rounded-[11px] py-[9px] font-mono text-[9px] font-medium',
        active ? 'bg-white/10 text-white' : 'text-rail-inactive hover:bg-white/5 hover:text-white'
      )}
    >
      {children}
      <span>{label}</span>
    </Link>
  )
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
  children: React.ReactNode
}) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [newExchangeOpen, setNewExchangeOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const active = exchanges.find((e) => e.id === activeExchangeId) ?? exchanges[0] ?? null
  const menuRef = useRef<HTMLDivElement>(null)
  const [listSearch, setListSearch] = useState('')

  // Contextual search is page-scoped: leaving the page clears it.
  useEffect(() => { setListSearch('') }, [pathname])

  const isStudents = pathname.startsWith('/students')
  const isSettings = pathname.startsWith('/settings')

  // Every "+ Nouvel échange" affordance routes through this. At the plan's
  // exchange cap we redirect straight to /billing instead of opening the modal
  // (createExchange would only return an { error: 'limit' } result anyway).
  const handleNewExchange = useCallback(() => {
    if (atCap) {
      router.push('/billing')
      return
    }
    setNewExchangeOpen(true)
  }, [atCap, router])

  const shellUi = useMemo<ShellUi>(() => ({
    openNewExchange: handleNewExchange,
    listSearch,
    setListSearch,
  }), [handleNewExchange, listSearch])

  useEffect(() => {
    if (!menuOpen) return
    function handleOutside(e: Event) {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Suspense fallback={null}>
        <NewExchangeAutoOpen onOpen={handleNewExchange} />
      </Suspense>
      <nav data-noprint className="flex w-[82px] flex-none flex-col items-center bg-rail py-[18px]">
        <div className="mb-[26px]">
          <Mark variant="dark" className="h-[19px] w-[26px]" />
        </div>
        <div className="flex w-full flex-col items-center gap-1.5">
          <RailItem href="/dashboard" label={t('shell.nav.dashboard')} active={pathname === '/dashboard'}>
            <IconOverview />
          </RailItem>
          {active && (
            <>
              <RailItem href="/applications" label={t('shell.nav.applications')} active={pathname.startsWith('/applications')}>
                <IconApplications />
              </RailItem>
              <RailItem href="/forms" label={t('shell.nav.files')} active={pathname.startsWith('/forms') || pathname.startsWith('/documents')}>
                <IconForms />
              </RailItem>
              <RailItem href="/students" label={t('shell.nav.students')} active={pathname.startsWith('/students')}>
                <IconStudents />
              </RailItem>
            </>
          )}
        </div>
        <div className="mt-auto">
          <RailItem href="/settings" label={t('shell.accountMenu.settings')} active={isSettings}>
            <IconSettings />
          </RailItem>
        </div>
        <div ref={menuRef} className="relative mt-2.5">
          {menuOpen && (
            <div className="absolute bottom-full left-0 z-30 mb-2 w-44 rounded-[11px] border bg-card p-1 shadow-float">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full rounded-[8px] px-3 py-2 text-left text-sm text-foreground hover:bg-hoverrow"
              >
                {t('shell.accountMenu.signOut')}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={t('shell.accountMenu.trigger')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 font-mono text-[11px] text-white"
          >
            {initials(organizerName)}
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
                <SessionSelector
                  exchanges={exchanges}
                  active={active}
                  onNewExchange={handleNewExchange}
                />
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
            {!isSettings && active && isStudents && (
              <input
                type="search"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder={t('shell.studentSearch.placeholder')}
                className="h-[38px] w-[220px] rounded-[9px] border bg-hoverrow px-3.5 text-[13px] placeholder:text-placeholder focus:border-brand focus:outline-none"
              />
            )}
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="flex h-[38px] items-center gap-2 rounded-[9px] border px-3.5 text-[13px] font-medium text-muted-foreground hover:bg-hoverrow hover:text-foreground"
            >
              <IconFeedbackLight />
              <span>{t('shell.nav.feedback')}</span>
            </button>
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
  )
}
