import { landingContent } from '@/lib/landing/content'

export function ProblemSolution() {
  const {
    problemLabel,
    problemTitle,
    problemBody,
    solutionLabel,
    solutionTitle,
    solutionBody,
  } = landingContent.problemSolution

  return (
    <section className="bg-paper">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-20 md:grid-cols-2 md:gap-6">
        {/* Before — the pending stub */}
        <article className="relative overflow-hidden rounded-2xl border border-paper-line bg-paper-card p-8">
          <span
            aria-hidden
            className="absolute -right-5 top-6 rotate-12 rounded border-2 border-stamp/30 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-stamp/40"
          >
            Pending
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted">
            {problemLabel}
          </span>
          <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">
            {problemTitle}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-muted">{problemBody}</p>
        </article>

        {/* After — cleared */}
        <article className="relative overflow-hidden rounded-2xl border border-cleared/25 bg-paper-card p-8 shadow-sm ring-1 ring-cleared/10">
          <span className="absolute inset-y-0 left-0 w-1 bg-cleared" aria-hidden />
          <span
            aria-hidden
            className="absolute -right-5 top-6 rotate-12 rounded border-2 border-cleared/40 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-cleared/70"
          >
            Cleared
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-cleared-soft">
            {solutionLabel}
          </span>
          <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">
            {solutionTitle}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-muted">{solutionBody}</p>
        </article>
      </div>
    </section>
  )
}
