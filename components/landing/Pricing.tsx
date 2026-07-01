import Link from 'next/link'
import { Check } from 'lucide-react'
import { landingContent } from '@/lib/landing/content'

export function Pricing() {
  const { eyebrow, title, subtitle, popularLabel, valueProp, tiers, note } =
    landingContent.pricing

  return (
    <section className="border-t border-paper-line bg-paper-card">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-cleared-soft">
            {eyebrow}
          </span>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {title}
          </h2>
          <p className="mt-3 text-ink-muted">{subtitle}</p>
        </div>

        {/* The cost-of-chasing stat — a bold ink data moment */}
        <div className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-2xl bg-ink p-8 text-center text-white">
          <p className="font-display text-xl font-bold leading-snug text-balance">
            {valueProp.headline}
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/60 text-balance">
            {valueProp.body}
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => {
            const highlighted = tier.highlighted
            return (
              <article
                key={tier.name}
                className={
                  highlighted
                    ? 'relative flex flex-col rounded-2xl bg-ink p-7 text-white shadow-xl shadow-ink/20 ring-1 ring-cleared/30'
                    : 'relative flex flex-col rounded-2xl border border-paper-line bg-paper p-7'
                }
              >
                <div className="flex items-center justify-between">
                  <h3
                    className={`font-display text-lg font-bold ${
                      highlighted ? 'text-white' : 'text-ink'
                    }`}
                  >
                    {tier.name}
                  </h3>
                  {highlighted && (
                    <span className="rounded-full bg-cleared px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink">
                      {popularLabel}
                    </span>
                  )}
                </div>

                <p className="mt-5 flex items-baseline gap-1.5">
                  <span
                    className={`font-display text-4xl font-bold tracking-tight ${
                      highlighted ? 'text-white' : 'text-ink'
                    }`}
                  >
                    {tier.price}
                  </span>
                  <span
                    className={`font-mono text-xs uppercase tracking-wide ${
                      highlighted ? 'text-white/50' : 'text-ink-muted'
                    }`}
                  >
                    {tier.period}
                  </span>
                </p>
                <p className={`mt-2 text-sm ${highlighted ? 'text-white/60' : 'text-ink-muted'}`}>
                  {tier.description}
                </p>

                <ul className="mt-6 space-y-3 text-sm">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <Check
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          highlighted ? 'text-cleared' : 'text-cleared-soft'
                        }`}
                        aria-hidden
                      />
                      <span className={highlighted ? 'text-white/85' : 'text-ink/80'}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={tier.cta.href}
                  className={
                    highlighted
                      ? 'mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-cleared px-5 font-display text-sm font-bold text-ink transition-colors hover:bg-cleared-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cleared'
                      : 'mt-8 inline-flex h-11 items-center justify-center rounded-lg border border-ink/20 px-5 font-display text-sm font-bold text-ink transition-colors hover:bg-ink hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
                  }
                >
                  {tier.cta.label}
                </Link>
              </article>
            )
          })}
        </div>

        <p className="mt-8 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
          {note}
        </p>
      </div>
    </section>
  )
}
