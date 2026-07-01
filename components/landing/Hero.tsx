import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { landingContent } from '@/lib/landing/content'
import { BoardingManifest } from './BoardingManifest'

export function Hero() {
  const { eyebrow, headline, subhead, primaryCta, secondaryCta } = landingContent.hero
  return (
    <section className="relative overflow-hidden bg-ink text-white">
      {/* Ambient departures-board glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 h-[36rem] w-[36rem] rounded-full bg-cleared/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 bottom-0 h-[28rem] w-[28rem] rounded-full bg-boarding/5 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
        <div>
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-cleared">
            <span className="h-1.5 w-1.5 rounded-full bg-cleared" aria-hidden />
            {eyebrow}
          </span>

          <h1 className="mt-5 max-w-xl font-display text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-[3.5rem]">
            {headline}
          </h1>

          <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/65 text-balance">
            {subhead}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={primaryCta.href}
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-cleared px-6 font-display text-sm font-bold text-ink transition-colors hover:bg-cleared-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cleared"
            >
              {primaryCta.label}
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
            <Link
              href={secondaryCta.href}
              className="inline-flex h-12 items-center justify-center rounded-lg border border-white/20 px-6 font-display text-sm font-semibold text-white/90 transition-colors hover:border-white/40 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {secondaryCta.label}
            </Link>
          </div>

          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
            No credit card · Set up in minutes · Cancel anytime
          </p>
        </div>

        <div className="lg:pl-4">
          <BoardingManifest />
        </div>
      </div>

      {/* Perforated boarding-pass divider into the paper sections */}
      <div aria-hidden className="relative h-px border-t border-dashed border-white/15" />
    </section>
  )
}
