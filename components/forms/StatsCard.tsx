// Top stats strip shared by /forms and /documents: N number stats + a
// progress bar (« Réponses reçues » / « Pièces reçues »).
export function StatsCard({
  stats, barLabel, done, total,
}: {
  stats: { value: string; label: string }[]
  barLabel: string
  done: number
  total: number
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-[26px] rounded-[14px] border bg-card px-6 py-[18px]">
      {stats.map((s, i) => (
        <div key={i} className="flex items-center gap-[26px]">
          {i > 0 && <div className="h-[34px] w-px bg-background" />}
          <div className="flex flex-col gap-1">
            <span className="font-display text-2xl font-bold leading-none text-navy">{s.value}</span>
            <span className="text-[11.5px] font-medium text-muted-foreground">{s.label}</span>
          </div>
        </div>
      ))}
      <div className="ml-auto min-w-[200px] flex-1">
        <div className="mb-[7px] flex items-center justify-between">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-placeholder">{barLabel}</span>
          <span className="text-xs font-medium text-muted-foreground">{done} / {total}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-pill bg-background">
          <div className="h-full rounded-pill bg-brand" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}
