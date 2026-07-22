import type { PreviewBlock } from '@/lib/forms/fillable-preview'

// « Paper » mini-page for fillable documents: the definition's real title and
// opening paragraphs at thumbnail scale, with inline blanks drawn as brand
// underlines and a signature row at the foot. Presentational only — all
// derivation lives in lib/forms/fillable-preview.ts.
//
// Text is intentionally sub-legible (≈4.3px): at card size the goal is that
// the card reads as a dense legal document, not that anyone reads it.
export function FillablePaper({ blocks }: { blocks: PreviewBlock[] }) {
  if (blocks.length === 0) return <PaperSkeleton />

  return (
    <div data-testid="fillable-paper" className="flex h-full flex-col overflow-hidden">
      {blocks.map((block, i) => {
        if (block.p === 'kicker') {
          return (
            <div key={i} className="mb-0.5 truncate text-[4.6px] font-bold uppercase tracking-[.4px] text-tertiary">
              {block.text}
            </div>
          )
        }
        if (block.p === 'title') {
          return (
            <div key={i} className="mb-1.5 line-clamp-2 text-center text-[6.2px] font-extrabold leading-tight text-navy">
              {block.text}
            </div>
          )
        }
        if (block.p === 'paragraph') {
          return (
            <p key={i} className="mb-1 text-justify text-[4.3px] leading-[1.5] text-muted-foreground">
              {block.runs.map((run, j) =>
                run.t === 'text'
                  ? <span key={j}>{run.text}</span>
                  : <span key={j} aria-hidden="true" className="inline-block w-[22px] border-b border-brand align-baseline" />
              )}
            </p>
          )
        }
        return (
          <div key={i} className="mt-auto flex gap-1.5 border-t border-frame pt-1">
            {block.labels.map((label) => (
              <div key={label} className="min-w-0 flex-1">
                <div className="truncate text-[4px] text-placeholder">{label}</div>
                <div aria-hidden="true" className="h-2 rounded-[1px] border border-frame" />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// Shown when no definition matches the template's standard_key — the same
// neutral lines the card used before this feature existed.
function PaperSkeleton() {
  return (
    <div data-testid="fillable-paper-skeleton" aria-hidden="true" className="flex flex-col gap-1.5">
      <div className="h-1.5 w-4/5 rounded-sm bg-background" />
      <div className="h-1.5 w-3/5 rounded-sm bg-background" />
      <div className="h-1.5 w-4/6 rounded-sm bg-background" />
    </div>
  )
}
