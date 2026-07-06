import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Logo } from './Logo'
import type { Lang, LandingContent } from '@/lib/landing/content'

export function LandingNav({
  nav,
  lang,
  setLanguage,
}: {
  nav: LandingContent['nav']
  lang: Lang
  setLanguage: (l: Lang) => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(e: Event) {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(l: Lang) {
    setLanguage(l)
    setOpen(false)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[#EEF1F7] bg-white/[.86] backdrop-blur-[12px]">
      <div className="mx-auto flex h-[70px] max-w-[1180px] items-center justify-between px-6 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-[18px] font-bold text-[#10203F]">Eazyexchange</span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-7">
          <a
            href="#features"
            className="hidden text-[14px] font-medium text-[#42506E] hover:text-[#10203F] sm:inline"
          >
            {nav.features}
          </a>
          <Link
            href="/login"
            className="hidden text-[14px] font-medium text-[#42506E] hover:text-[#10203F] sm:inline"
          >
            {nav.login}
          </Link>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label="Changer de langue"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[12px] font-semibold uppercase text-[#5B6B8C] hover:bg-[#F1F4F9] hover:text-[#10203F]"
            >
              <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18" />
                <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
              </svg>
              {lang}
              <span aria-hidden className="text-[9px]">▾</span>
            </button>
            {open && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-1.5 w-36 overflow-hidden rounded-[10px] border border-[#E4E9F2] bg-white py-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => pick('fr')}
                  className={`block w-full px-3.5 py-2 text-left text-[13px] hover:bg-[#F1F4F9] ${lang === 'fr' ? 'font-semibold text-[#10203F]' : 'text-[#5B6B8C]'}`}
                >
                  Français
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => pick('en')}
                  className={`block w-full px-3.5 py-2 text-left text-[13px] hover:bg-[#F1F4F9] ${lang === 'en' ? 'font-semibold text-[#10203F]' : 'text-[#5B6B8C]'}`}
                >
                  English
                </button>
              </div>
            )}
          </div>
          <Link
            href="/signup"
            className="rounded-lg bg-[#10203F] px-[18px] py-2.5 text-[14px] font-semibold text-white transition hover:brightness-110"
          >
            {nav.demo}
          </Link>
        </nav>
      </div>
    </header>
  )
}
