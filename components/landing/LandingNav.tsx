import Link from 'next/link'
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
          <div className="flex gap-0.5 rounded-lg bg-[#F1F4F9] p-[3px]">
            {(['fr', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLanguage(l)}
                aria-pressed={lang === l}
                className={`rounded-md px-3.5 py-1.5 font-mono text-[12px] font-semibold uppercase transition-colors ${
                  lang === l ? 'bg-[#10203F] text-white' : 'text-[#5B6B8C]'
                }`}
              >
                {l}
              </button>
            ))}
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
