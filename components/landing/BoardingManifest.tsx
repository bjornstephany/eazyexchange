import { Check, Plane } from 'lucide-react'
import { landingContent } from '@/lib/landing/content'

/**
 * The signature element: a departures-board style boarding manifest whose
 * status pills "stamp" from Pending (amber) to Cleared (green) on load,
 * ending on a "Ready for departure" bar. Pure CSS animation (see globals.css)
 * so it stays a server component and respects prefers-reduced-motion — with
 * reduced motion, the board simply renders in its final, all-cleared state.
 */
export function BoardingManifest() {
  const { manifest } = landingContent.hero
  const { columns, rows } = manifest
  const stagger = 0.32 // seconds between each row's stamp
  const lastDelay = (rows.length - 1) * stagger + 0.3
  const readyDelay = lastDelay + 0.55

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-ink-800 p-3 font-mono text-ink-muted shadow-2xl shadow-black/40 ring-1 ring-white/5 sm:p-4">
      {/* Board header */}
      <div className="flex items-center justify-between border-b border-white/10 px-1 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex gap-1" aria-hidden>
            <span className="h-2 w-2 rounded-full bg-boarding/80" />
            <span className="h-2 w-2 rounded-full bg-cleared/80" />
            <span className="h-2 w-2 rounded-full bg-white/20" />
          </span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-white/70">
            {manifest.programLabel}
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-cleared">
          <span className="manifest-blip h-1.5 w-1.5 rounded-full bg-cleared" aria-hidden />
          Live
        </span>
      </div>

      {/* Column labels */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-1 py-2 text-[10px] uppercase tracking-[0.18em] text-white/35 sm:grid-cols-[1.1fr_1.2fr_auto_auto]">
        <span>{columns.student}</span>
        <span className="hidden sm:block">{columns.form}</span>
        <span className="hidden text-right sm:block">{columns.due}</span>
        <span className="text-right">{columns.status}</span>
      </div>

      {/* Rows */}
      <ul className="space-y-1">
        {rows.map((row, i) => {
          const delay = `${0.3 + i * stagger}s`
          return (
            <li
              key={row.student}
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md px-1 py-2 odd:bg-white/[0.02] sm:grid-cols-[1.1fr_1.2fr_auto_auto]"
            >
              <span className="truncate text-[13px] text-white/90">{row.student}</span>
              <span className="hidden truncate text-[12px] text-white/45 sm:block">
                {row.form}
              </span>
              <span className="hidden text-right text-[12px] tabular-nums text-white/45 sm:block">
                {row.due}
              </span>

              {/* Status cell — pending pill fades out as cleared pill stamps in */}
              <span className="relative flex h-6 w-[104px] items-center justify-self-end">
                <span
                  className="manifest-pending absolute inset-0 flex items-center justify-center gap-1.5 rounded-full border border-boarding/30 bg-boarding/10 text-[10px] font-bold uppercase tracking-[0.12em] text-boarding"
                  style={{ animationDelay: delay }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-boarding" aria-hidden />
                  {manifest.pendingLabel}
                </span>
                <span
                  className="manifest-cleared absolute inset-0 flex items-center justify-center gap-1 rounded-full border border-cleared/40 bg-cleared/15 text-[10px] font-bold uppercase tracking-[0.12em] text-cleared"
                  style={{ animationDelay: delay }}
                >
                  <Check className="h-3 w-3" aria-hidden />
                  {manifest.clearedLabel}
                </span>
              </span>
            </li>
          )
        })}
      </ul>

      {/* Ready-for-departure bar */}
      <div
        className="manifest-ready mt-3 flex items-center gap-2 rounded-lg border border-cleared/25 bg-cleared/10 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-cleared"
        style={{ animationDelay: `${readyDelay}s` }}
      >
        <Plane className="h-3.5 w-3.5 -rotate-12" aria-hidden />
        {manifest.readyLine}
      </div>
    </div>
  )
}
