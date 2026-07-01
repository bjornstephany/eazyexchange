import { Plane } from 'lucide-react'
import { landingContent } from '@/lib/landing/content'

export function HowItWorks() {
  const { eyebrow, title, subtitle, steps } = landingContent.howItWorks
  return (
    <section className="bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="max-w-2xl">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-cleared-soft">
            {eyebrow}
          </span>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {title}
          </h2>
          <p className="mt-3 text-ink-muted">{subtitle}</p>
        </div>

        <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1
            return (
              <li key={step.number} className="relative">
                <div className="relative flex items-center">
                  <span className="relative z-10 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-sm font-bold text-white ring-4 ring-paper">
                    {String(step.number).padStart(2, '0')}
                  </span>
                  {/* Route line to the next stop */}
                  {!isLast && (
                    <span
                      aria-hidden
                      className="absolute left-12 top-1/2 hidden h-px w-[calc(100%-1rem)] border-t border-dashed border-ink/25 lg:block"
                    />
                  )}
                  {isLast && (
                    <Plane
                      aria-hidden
                      className="ml-3 hidden h-4 w-4 -rotate-12 text-cleared-soft lg:block"
                    />
                  )}
                </div>
                <h3 className="mt-5 font-display text-lg font-bold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{step.description}</p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
