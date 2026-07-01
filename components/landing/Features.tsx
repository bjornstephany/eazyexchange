import { landingContent } from '@/lib/landing/content'

export function Features() {
  const { eyebrow, title, subtitle, items } = landingContent.features
  return (
    <section className="border-y border-paper-line bg-paper-card">
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

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <article
                key={item.title}
                className="group relative flex flex-col rounded-xl border border-paper-line bg-paper py-6 pl-7 pr-6 transition-shadow hover:shadow-md"
              >
                {/* Boarding-pass stub perforation */}
                <span
                  aria-hidden
                  className="absolute inset-y-4 left-3 border-l border-dashed border-paper-line"
                />
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-ink text-cleared">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-muted/70">
                    {item.code}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.description}</p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
