import type { Pill } from '@/lib/dashboard/rollup'

const KIND_CLASSES: Record<Pill['kind'], string> = {
  ok: 'bg-success text-success-text',
  warn: 'bg-warn text-warn-text',
  info: 'bg-tint text-tint-text',
  bad: 'bg-danger text-danger-text',
  neutral: 'bg-subtle text-muted-foreground',
}

export function StatusPill({ pill }: { pill: Pill }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-[3px] rounded-pill text-[11px] font-semibold whitespace-nowrap ${KIND_CLASSES[pill.kind]}`}
    >
      {pill.label}
    </span>
  )
}
