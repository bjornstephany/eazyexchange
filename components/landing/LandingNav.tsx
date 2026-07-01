import Link from 'next/link'
import { landingContent } from '@/lib/landing/content'
import { Logo } from '@/components/brand/Logo'

export function LandingNav() {
  const { login, getStarted } = landingContent.nav
  return (
    <header className="sticky top-0 z-20 border-b border-paper-line bg-paper/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <div className="flex items-center gap-1.5">
          <Link
            href={login.href}
            className="inline-flex h-9 items-center rounded-md px-4 font-display text-sm font-semibold text-ink/80 transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {login.label}
          </Link>
          <Link
            href={getStarted.href}
            className="inline-flex h-9 items-center rounded-md bg-ink px-4 font-display text-sm font-bold text-white transition-colors hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {getStarted.label}
          </Link>
        </div>
      </nav>
    </header>
  )
}
