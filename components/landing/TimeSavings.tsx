import type { LandingContent } from '@/lib/landing/content'

export function TimeSavings({ savings }: { savings: LandingContent['savings'] }) {
  return (
    <section className="bg-[#0E1B38] py-[72px]">
      <div className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-[52px] px-6">
        <div className="min-w-[290px] flex-[1.1]">
          <p className="mb-3.5 font-mono text-[11px] font-semibold uppercase tracking-[.14em] text-[#7FA0F0]">
            {savings.eyebrow}
          </p>
          <h2 className="mb-4 text-balance font-display text-[length:clamp(26px,3.2vw,38px)] font-bold leading-[1.12] tracking-[-.02em] text-white">
            {savings.title}
          </h2>
          <p className="mb-3 max-w-[480px] text-[15.5px] leading-[1.65] text-[#C3CEE6]">{savings.p1}</p>
          <p className="max-w-[480px] text-[15.5px] leading-[1.65] text-[#C3CEE6]">{savings.p2}</p>
        </div>
        <div className="min-w-[300px] flex-1 rounded-[14px] border border-white/10 bg-[#10203F] px-7 py-[26px]">
          <p className="mb-[18px] font-mono text-[10px] font-semibold uppercase tracking-[.12em] text-[#7FA0F0]">
            {savings.cardTitle}
          </p>
          {savings.rows.map((row) => (
            <div
              key={row.label}
              className="flex justify-between gap-4 border-b border-dashed border-white/[.14] py-[11px]"
            >
              <span className="text-[13.5px] text-[#C3CEE6]">{row.label}</span>
              <span
                className={`whitespace-nowrap font-mono text-[13px] font-semibold ${row.green ? 'text-[#7EE3A4]' : 'text-white'}`}
              >
                {row.value}
              </span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 pb-0.5 pt-4">
            <span className="text-[14.5px] font-semibold text-white">{savings.totalLabel}</span>
            <span className="whitespace-nowrap font-display text-[26px] font-bold text-[#7FA0F0]">
              {savings.totalValue}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
