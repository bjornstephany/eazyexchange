import Link from 'next/link'
import { landingContent } from '@/lib/landing/content'
import { GlobeMark } from '@/components/brand/GlobeMark'

export function LandingFooter() {
  const { tagline, links, copyright } = landingContent.footer
  return (
    <footer className="bg-ink text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-14 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xs">
          <span className="inline-flex items-center gap-2">
            <GlobeMark className="h-7 w-7 shrink-0" />
            <span className="font-display text-lg font-bold tracking-tight">
              <span className="text-cleared">Eazy</span>Exchange
            </span>
          </span>
          <p className="mt-3 text-sm leading-relaxed text-white/50">{tagline}</p>
        </div>
        <nav className="flex gap-6 font-mono text-[12px] uppercase tracking-[0.16em]">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-white/60 transition-colors hover:text-cleared"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-6 font-mono text-[11px] uppercase tracking-[0.14em] text-white/35">
          © {new Date().getFullYear()} {copyright}
        </p>
      </div>
    </footer>
  )
}
