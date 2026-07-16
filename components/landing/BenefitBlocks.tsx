import { Fragment } from 'react'
import type { LandingContent, MatrixCell } from '@/lib/landing/content'
import { StatusPill, TONE } from './tones'

function BlockText({ block }: { block: LandingContent['benefits']['blocks'][number] }) {
  return (
    <div className="min-w-[290px] flex-1">
      <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[.14em] text-[#2456E6]">
        {block.eyebrow}
      </p>
      <h2 className="mb-3.5 text-balance font-display text-[length:clamp(26px,3vw,34px)] font-bold leading-[1.12] tracking-[-.02em] text-[#10203F]">
        {block.title}
      </h2>
      <p className="max-w-[460px] text-[15.5px] leading-[1.6] text-[#5B6B8C]">{block.body}</p>
    </div>
  )
}

const VISUAL_CARD =
  'min-w-[300px] flex-[1.15] rounded-[14px] border border-[#E4E9F2] bg-white px-[22px] py-5 shadow-[0_24px_50px_-34px_rgba(16,32,63,.35)]'

function InviteVisual({ invite }: { invite: LandingContent['benefits']['invite'] }) {
  return (
    <div className={VISUAL_CARD}>
      <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-[#8A97B2]">
        {invite.label}
      </p>
      <div className="mb-[18px] flex flex-wrap gap-2.5">
        <div className="flex h-[38px] min-w-[170px] flex-1 items-center gap-[7px] overflow-hidden rounded-[9px] border border-[#E4E9F2] bg-[#F5F7FC] px-3">
          <span className="inline-flex whitespace-nowrap rounded-full bg-[#E6ECFD] px-2 py-0.5 font-mono text-[11px] font-medium text-[#1D48C7]">
            {invite.chip}
          </span>
          <span className="whitespace-nowrap font-mono text-[11px] font-medium text-[#9AA6C0]">{invite.more}</span>
        </div>
        <span className="inline-flex h-[38px] items-center rounded-[9px] bg-[#10203F] px-[15px] text-[13px] font-semibold text-white">
          {invite.button}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {invite.students.map((s) => (
          <div key={s.name} className="flex items-center gap-3">
            <span className="w-[118px] flex-none text-[13px] font-semibold text-[#10203F]">{s.name}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EEF1F7]">
              <span
                className={`block h-full rounded-full ${s.done ? 'bg-[#0F7A3D]' : 'bg-[#2456E6]'}`}
                style={{ width: `${s.pct}%` }}
              />
            </span>
            <span
              className={`w-[38px] text-right font-mono text-[11px] font-medium ${s.done ? 'text-[#0F7A3D]' : 'text-[#5B6B8C]'}`}
            >
              {s.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RemindersVisual({ reminders }: { reminders: LandingContent['benefits']['reminders'] }) {
  return (
    <div className={VISUAL_CARD}>
      <div className="mb-3.5 flex items-center justify-between gap-2.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-[#8A97B2]">
          {reminders.label}
        </span>
        <span className="inline-flex items-center gap-[7px] font-mono text-[11px] font-semibold text-[#2456E6]">
          <span aria-hidden className="relative inline-block h-[17px] w-[30px] rounded-full bg-[#2456E6]">
            <span className="absolute right-0.5 top-0.5 h-[13px] w-[13px] rounded-full bg-white" />
          </span>
          {reminders.toggle}
        </span>
      </div>
      <div className="flex flex-col gap-[11px]">
        {reminders.rows.map((r, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-[10px] border border-[#EEF1F7] bg-[#FBFCFE] px-[13px] py-2.5"
          >
            <span className="flex-none font-mono text-[10.5px] font-medium text-[#9AA6C0]">{r.time}</span>
            <span className="flex-1 text-[12.5px] text-[#42506E]">{r.text}</span>
            <StatusPill pill={r.pill} />
          </div>
        ))}
      </div>
      <p className="mt-[13px] font-mono text-[11px] font-medium text-[#9AA6C0]">{reminders.note}</p>
    </div>
  )
}

function MatrixCellBox({ cell }: { cell: MatrixCell }) {
  const t = TONE[cell.tone]
  const symbol = cell.label === '✓' || cell.label === '—'
  return (
    <span
      className={`flex h-[22px] items-center justify-center rounded-md font-mono font-semibold ${symbol ? 'text-[11px]' : 'text-[10px]'} ${cell.ring ? 'border-[1.5px] border-[#C0392B]' : ''}`}
      style={{ background: t.bg, color: cell.tone === 'mut' ? '#9AA6C0' : t.fg }}
    >
      {cell.label}
    </span>
  )
}

function MatrixVisual({ matrix }: { matrix: LandingContent['benefits']['matrix'] }) {
  const swatches = [
    { key: 'ok', label: matrix.legend.ok },
    { key: 'warn', label: matrix.legend.warn },
    { key: 'bad', label: matrix.legend.bad },
  ] as const
  return (
    <div className={VISUAL_CARD}>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-[#8A97B2]">
          {matrix.label}
        </span>
        <span className="text-[12px] font-medium text-[#5B6B8C]">
          {matrix.done} · <span className="font-semibold text-[#C0392B]">{matrix.blocked}</span>
        </span>
      </div>
      <div className="grid grid-cols-[96px_repeat(4,1fr)] items-center gap-x-1.5 gap-y-2">
        <span />
        {matrix.cols.map((c) => (
          <span
            key={c}
            className="text-center font-mono text-[9px] font-semibold uppercase tracking-[.05em] text-[#9AA6C0]"
          >
            {c}
          </span>
        ))}
        {matrix.rows.map((row) => (
          <Fragment key={row.name}>
            <span className="text-[12.5px] font-semibold text-[#10203F]">{row.name}</span>
            {row.cells.map((cell, i) => (
              <MatrixCellBox key={i} cell={cell} />
            ))}
          </Fragment>
        ))}
      </div>
      <div className="mt-3.5 flex flex-wrap gap-3.5">
        {swatches.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-[5px] font-mono text-[10.5px] font-medium text-[#8A97B2]">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-[3px] border"
              style={{ background: TONE[s.key].bg, borderColor: TONE[s.key].fg }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export function BenefitBlocks({ benefits }: { benefits: LandingContent['benefits'] }) {
  const [invitations, reminders, tracking] = benefits.blocks
  return (
    <section id="produit" className="bg-[#EEF1F7] pb-5 pt-[70px]">
      <div className="mx-auto flex max-w-[1160px] flex-col gap-16 px-6">
        <div className="flex flex-wrap items-center gap-11">
          <BlockText block={invitations} />
          <InviteVisual invite={benefits.invite} />
        </div>
        <div className="flex flex-row-reverse flex-wrap items-center gap-11">
          <BlockText block={reminders} />
          <RemindersVisual reminders={benefits.reminders} />
        </div>
        <div className="flex flex-wrap items-center gap-11 pb-[50px]">
          <BlockText block={tracking} />
          <MatrixVisual matrix={benefits.matrix} />
        </div>
      </div>
    </section>
  )
}
