import Link from 'next/link'
import type { LandingContent, MockStatus } from '@/lib/landing/content'

const STATUS_STYLE: Record<MockStatus, { fg: string; bg: string }> = {
  complete: { fg: '#0F7A3D', bg: '#E4F5EA' },
  pending: { fg: '#9A6A0B', bg: '#FBF0D9' },
  review: { fg: '#1D48C7', bg: '#E6ECFD' },
  missing: { fg: '#C0392B', bg: '#FBE7E4' },
}

const COLS = 'grid-cols-[1.35fr_.95fr_1.05fr_1.05fr_.95fr]'

export function Hero({ hero }: { hero: LandingContent['hero'] }) {
  const { mock } = hero
  return (
    <section className="mx-auto grid max-w-[1180px] items-center gap-14 px-6 pb-[72px] pt-20 sm:px-10 lg:grid-cols-[1fr_1.05fr]">
      <div>
        <p className="mb-[22px] font-mono text-[12px] font-semibold uppercase tracking-[.14em] text-[#2456E6]">
          {hero.eyebrow}
        </p>
        <h1 className="mb-[22px] font-display text-[40px] font-bold leading-[1.04] tracking-[-.025em] text-[#10203F] sm:text-[56px]">
          {hero.title}
        </h1>
        <p className="mb-8 max-w-[480px] text-[18px] leading-[1.6] text-[#5B6B8C]">{hero.sub}</p>
        <div className="flex flex-wrap items-center gap-3.5">
          <Link
            href="/signup"
            className="rounded-[9px] bg-[#2456E6] px-[26px] py-[15px] text-[15px] font-semibold text-white transition hover:brightness-110"
          >
            {hero.ctaPrimary}
          </Link>
          <span className="text-[13px] font-medium text-[#5B6B8C]">{hero.note}</span>
        </div>
        <p className="mt-[26px] text-[13px] font-medium text-[#8A97B2]">{hero.trust}</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#E4E9F2] bg-white shadow-[0_30px_70px_-34px_rgba(16,32,63,.4)]">
        <div className="flex items-center justify-between border-b border-[#EEF1F7] bg-[#FBFCFE] px-5 py-[15px]">
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#2456E6]" />
            <span className="text-[13px] font-semibold text-[#10203F]">{mock.title}</span>
          </div>
          <span className="font-mono text-[11px] font-medium text-[#8A97B2]">{mock.countLabel}</span>
        </div>
        <div className={`grid ${COLS} gap-2 border-b border-[#F1F4F9] px-4 py-3`}>
          {mock.cols.map((c) => (
            <span
              key={c}
              className="font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-[#9AA6C0]"
            >
              {c}
            </span>
          ))}
        </div>
        {mock.rows.map((row) => (
          <div
            key={row.name}
            className={`grid ${COLS} items-center gap-2 border-b border-[#F4F6FB] px-4 py-[13px]`}
          >
            <span className="text-[13px] font-semibold text-[#10203F]">{row.name}</span>
            {([row.app, row.forms, row.docs, row.status] as MockStatus[]).map((s, i) => (
              <span
                key={i}
                className="inline-flex justify-self-start whitespace-nowrap rounded-full px-2 py-[3px] text-[10px] font-semibold"
                style={{ background: STATUS_STYLE[s].bg, color: STATUS_STYLE[s].fg }}
              >
                {mock.statusLabels[s]}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
