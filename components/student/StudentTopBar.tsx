'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/brand/Logo'
import { StudentLanguageMenu } from '@/components/student/StudentLanguageMenu'
import type { Locale } from '@/lib/i18n/config'

export function StudentTopBar({ initials, exchangeLabel, locale }: {
  initials: string; exchangeLabel: string | null; locale: Locale
}) {
  const t = useTranslations('student')
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleOutside(e: Event) {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false) }
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
    <header className="sticky top-0 z-20 flex h-[66px] items-center justify-between border-b bg-card px-7">
      <Logo />
      <div className="flex items-center gap-3.5">
        {exchangeLabel && (
          <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {exchangeLabel}
          </span>
        )}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-label={t('shell.account')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-tint font-mono text-[11px] font-semibold text-tint-text"
          >
            {initials}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 w-52 rounded-[11px] border bg-card p-1 shadow-float">
              <StudentLanguageMenu current={locale} />
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full rounded-[8px] px-3 py-2 text-left text-sm text-foreground hover:bg-hoverrow"
              >
                {t('shell.signOut')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
