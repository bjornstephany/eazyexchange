'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useShellUi } from '@/components/shell/ShellUiContext'
import {
  chipDefs, filterStudents, listSummary,
  type StudentVM, type StatusKey,
} from '@/lib/students/directory'
import { StudentDetail } from './StudentDetail'

export function StudentsView({ exchangeId, students }: { exchangeId: string; students: StudentVM[] }) {
  const t = useTranslations('organizer')
  const { listSearch } = useShellUi()
  const [statusFilter, setStatusFilter] = useState<StatusKey | null>(null)
  const [selId, setSelId] = useState<string | null>(null)

  const chips = chipDefs(students)
  const visible = filterStudents(students, statusFilter, listSearch)
  const selected = visible.find(v => v.id === selId) ?? visible[0] ?? null

  return (
    <div>
      <div className="flex gap-5">
        {/* list column */}
        <div className="w-[340px] flex-none">
          <div className="mb-[13px]">
            <h1 className="mb-1 font-display text-[25px] font-bold leading-[1.1] tracking-[-.02em]">{t('students.title')}</h1>
            <p className="text-[13px] text-muted-foreground">{listSummary(students)}</p>
          </div>
          <div className="mb-[13px] flex flex-wrap gap-1.5">
            {chips.map(c => {
              const active = statusFilter === c.key
              return (
                <button
                  key={c.label} type="button"
                  onClick={() => setStatusFilter(active || c.key === null ? null : c.key)}
                  className={`inline-flex items-center gap-[7px] whitespace-nowrap rounded-pill border px-3 py-1.5 text-[12.5px] font-medium ${
                    active || (c.key === null && statusFilter === null)
                      ? 'border-navy bg-navy text-white'
                      : 'border-frame-dashed bg-card text-foreground hover:border-placeholder'
                  }`}
                >
                  {c.label}
                  <span className={`rounded-pill px-[7px] py-px font-mono text-[10.5px] font-semibold ${
                    active || (c.key === null && statusFilter === null)
                      ? 'bg-white/15 text-white' : 'bg-background text-tertiary'
                  }`}>
                    {c.count}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-col gap-2">
            {visible.map(s => {
              const isSel = selected?.id === s.id
              return (
                <button
                  key={s.id} type="button" onClick={() => setSelId(s.id)}
                  className={`flex items-center gap-[11px] rounded-xl bg-card p-3 text-left ${
                    isSel ? 'border-[1.5px] border-brand shadow-float' : 'border hover:border-placeholder'
                  }`}
                >
                  <span
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ background: s.avatarBg }}
                  >
                    {s.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-foreground">{s.name}</span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-tertiary">{s.summary}</span>
                  </span>
                  <StatusDot kind={s.overall.kind} />
                </button>
              )
            })}
            {visible.length === 0 && (
              <p className="px-2.5 py-10 text-center text-[13px] text-tertiary">
                {t('students.emptyFilter')}
              </p>
            )}
          </div>
        </div>

        {/* detail panel */}
        <div className="min-w-0 flex-1 rounded-2xl border bg-card px-[30px] py-7">
          {selected && <StudentDetail key={selected.id} vm={selected} exchangeId={exchangeId} />}
          {!selected && (
            <p className="py-10 text-center text-[13px] text-tertiary">{t('students.selectPrompt')}</p>
          )}
        </div>
      </div>
    </div>
  )
}

const DOT: Record<string, string> = {
  ok: 'bg-success-text', info: 'bg-tint-text', warn: 'bg-warn-text', bad: 'bg-danger-text', neutral: 'bg-placeholder',
}
function StatusDot({ kind }: { kind: string }) {
  return <span className={`h-[9px] w-[9px] flex-none rounded-full ${DOT[kind] ?? DOT.neutral}`} />
}
