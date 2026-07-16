import type { Pill, PillTone } from '@/lib/landing/content'

// Status-pill palette from the 2026-07 landing handoff (docs/design_handoff_landing).
export const TONE: Record<PillTone, { fg: string; bg: string }> = {
  ok: { fg: '#0F7A3D', bg: '#E4F5EA' },
  warn: { fg: '#9A6A0B', bg: '#FBF0D9' },
  info: { fg: '#1D48C7', bg: '#E6ECFD' },
  bad: { fg: '#C0392B', bg: '#FBE7E4' },
  mut: { fg: '#5B6B8C', bg: '#EEF1F7' },
}

export function StatusPill({ pill, size = 'sm' }: { pill: Pill; size?: 'sm' | 'md' }) {
  const t = TONE[pill.tone]
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full font-semibold ${
        size === 'md' ? 'px-[11px] py-[3px] text-[12px]' : 'px-2.5 py-[3px] text-[11.5px]'
      }`}
      style={{ color: t.fg, background: t.bg }}
    >
      {pill.label}
    </span>
  )
}

// Numbered annotation badge (①②③ callouts of the product slice).
export function NumBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-[#2456E6] font-mono text-[10px] font-semibold text-white">
      {n}
    </span>
  )
}
