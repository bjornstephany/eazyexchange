'use client'

import { useState } from 'react'
import type { FunnelKey, LandingContent } from '@/lib/landing/content'
import { NumBadge, StatusPill } from './tones'

const GRID = 'grid-cols-[1.2fr_1fr_1fr_1.4fr_1fr]'

export function ProductSlice({ slice }: { slice: LandingContent['slice'] }) {
  const [filter, setFilter] = useState<FunnelKey>('all')

  const visible = filter === 'all' ? slice.rows : slice.rows.filter((r) => r.key === filter)
  const total = slice.funnel.find((f) => f.key === filter)?.count ?? visible.length
  const more = total - visible.length
  const foot =
    more > 0
      ? (more > 1 ? slice.footMoreMany : slice.footMoreOne).replace('{n}', String(more))
      : slice.footAll

  return (
    <section className="bg-[linear-gradient(#FBFCFE,#EEF1F7_120px)] pb-[26px] pt-2.5">
      <div className="mx-auto max-w-[1160px] px-6">
        <div className="overflow-hidden rounded-2xl border border-[#E4E9F2] bg-white shadow-[0_40px_80px_-50px_rgba(16,32,63,.4)]">
          <div className="flex flex-wrap items-center gap-3 border-b border-[#E4E9F2] px-[22px] py-3.5">
            <span className="font-display text-[16px] font-semibold text-[#10203F]">{slice.exchange}</span>
            <span className="inline-flex items-center rounded-full bg-[#E6ECFD] px-[11px] py-[5px] font-mono text-[11px] font-semibold text-[#1D48C7]">
              {slice.phase}
            </span>
          </div>
          <div className="flex flex-wrap items-start gap-5 px-[22px] py-5">
            <div className="flex min-w-[320px] flex-[2.1] flex-col gap-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                {slice.funnel.map((f) => {
                  const active = filter === f.key
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      aria-pressed={active}
                      className={`flex flex-col items-start gap-[3px] rounded-[11px] bg-white text-left transition hover:border-[#2456E6] ${
                        active
                          ? 'border-2 border-[#2456E6] px-[15px] pb-2 pt-[9px]'
                          : 'border border-[#E4E9F2] px-4 pb-[9px] pt-2.5'
                      }`}
                    >
                      <span
                        className={`font-display text-[20px] font-bold leading-none ${active ? 'text-[#2456E6]' : 'text-[#10203F]'}`}
                      >
                        {f.count}
                      </span>
                      <span className="text-[11px] font-medium text-[#5B6B8C]">{f.label}</span>
                    </button>
                  )
                })}
                <NumBadge n={3} />
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[600px] overflow-hidden rounded-xl border border-[#EEF1F7]">
                  <div className={`grid ${GRID} gap-3 border-b border-[#EEF1F7] bg-[#FBFCFE] px-[18px] py-[11px]`}>
                    {slice.cols.map((c) => (
                      <span
                        key={c}
                        className="font-mono text-[10px] font-semibold uppercase tracking-[.07em] text-[#9AA6C0]"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  {visible.map((row) => (
                    <div
                      key={row.name}
                      className={`grid ${GRID} items-center gap-3 border-b border-[#F4F6FB] px-[18px] py-3 hover:bg-[#FAFBFE]`}
                    >
                      <span className="text-[13px] font-semibold text-[#10203F]">{row.name}</span>
                      <span>
                        <StatusPill pill={row.cells[0]} />
                      </span>
                      <span>
                        <StatusPill pill={row.cells[1]} />
                      </span>
                      <span className="inline-flex items-center gap-[7px]">
                        <StatusPill pill={row.cells[2]} />
                        {row.flagged && <NumBadge n={2} />}
                      </span>
                      <span>
                        <StatusPill pill={row.cells[3]} />
                      </span>
                    </div>
                  ))}
                  <div className="bg-[#FBFCFE] px-[18px] py-[11px] font-mono text-[12px] font-medium text-[#9AA6C0]">
                    {foot}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex min-w-[250px] flex-1 flex-col gap-3.5">
              <div className="rounded-xl border border-[#EEF1F7] px-[17px] py-[15px]">
                <div className="mb-3 flex items-center gap-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-[#8A97B2]">
                    {slice.activityTitle}
                  </span>
                  <NumBadge n={1} />
                </div>
                <div className="flex flex-col gap-2.5">
                  {slice.activity.map((a, i) => (
                    <div key={i} className="flex items-baseline gap-[9px]">
                      <span className="flex-none font-mono text-[10.5px] font-medium text-[#9AA6C0]">{a.time}</span>
                      <span className={`text-[12.5px] leading-[1.4] ${a.ok ? 'text-[#0F7A3D]' : 'text-[#42506E]'}`}>
                        {a.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-[#E4E9F2] border-l-[3px] border-l-[#2456E6] bg-white px-[17px] py-[15px]">
                <p className="mb-1 font-display text-[14px] font-semibold text-[#10203F]">{slice.todoTitle}</p>
                <p className="text-[12.5px] leading-[1.45] text-[#5B6B8C]">{slice.todoBody}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-[30px] gap-y-3.5 px-1.5 pt-[18px]">
          {slice.annotations.map((text, i) => (
            <div key={i} className="flex min-w-[230px] flex-1 items-start gap-[9px]">
              <NumBadge n={i + 1} />
              <span className="text-[13px] leading-[1.5] text-[#5B6B8C]">{text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
