'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { AppRow, DossierRollup, TemplateInfo, CellMap, ActionCard, Pill, EnrolledStudent, LifecycleRow } from '@/lib/dashboard/rollup'
import {
  buildLifecycleRows,
  lifecycleFunnel,
  lifecycleFilter,
  lifecycleSubline,
  lifecycleActionCards,
  closedCount,
  formsPill,
  docsPill,
  nextDeadline,
  frShortDate,
} from '@/lib/dashboard/rollup'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { StudentDrawer, type DrawerSubject } from '@/components/dashboard/StudentDrawer'
import { InviteModal } from '@/components/dashboard/InviteModal'

export type OverviewProps = {
  exchangeId: string
  apps: AppRow[]
  students: EnrolledStudent[]
  rollups: DossierRollup[]
  templates: TemplateInfo[]
  cellMap: CellMap
  applicationOpen: boolean
  applicationDeadline: string | null
  applySlug: string
}

// Labels for filter keys that only exist on action cards, not as funnel tiles.
const ACTION_ONLY_FILTER_LABELS: Record<string, string> = {
  maybe: 'Hésitent',
  missingdocs: 'Docs manquants',
}

const GRID = 'grid-cols-[1.7fr_1.15fr_1fr_1fr_1fr_22px]'

const ACTION_BORDER: Record<ActionCard['tone'], string> = {
  accent: 'border-l-brand',
  warn: 'border-l-[#B7791F]',
  bad: 'border-l-[#C0392B]',
}
const ACTION_CTA: Record<ActionCard['tone'], string> = {
  accent: 'bg-brand text-white',
  warn: 'bg-warn text-warn-text',
  bad: 'bg-danger text-danger-text',
}

function checklistItemPill(group: 'form' | 'doc', status: string | undefined): Pill {
  if (status === 'approved') return { kind: 'ok', label: group === 'form' ? 'Reçu' : 'Fourni' }
  if (status === 'submitted') return { kind: 'info', label: 'À vérifier' }
  if (status === 'draft' || status === 'rejected') return { kind: 'warn', label: 'En cours' }
  return { kind: 'bad', label: 'Manquant' }
}

export function OverviewView(props: OverviewProps) {
  const { exchangeId, apps, students, rollups, templates, cellMap, applicationOpen, applicationDeadline, applySlug } = props
  const [filter, setFilter] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const [selected, setSelected] = useState<DrawerSubject | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  function studentSubject(rollup: DossierRollup): DrawerSubject {
    const items = templates.map((t) => {
      const group: 'form' | 'doc' = t.type === 'data_entry' ? 'form' : 'doc'
      const status = cellMap[`${rollup.studentId}:${t.id}`]?.status
      return { label: t.name, group, pill: checklistItemPill(group, status) }
    })
    return { kind: 'student', rollup, items }
  }

  function rowSubject(row: LifecycleRow): DrawerSubject {
    return row.kind === 'applicant' ? { kind: 'application', app: row.app } : studentSubject(row.rollup)
  }

  const rows = buildLifecycleRows(apps, students, rollups)

  // Opening applications revalidates /dashboard, which flips these props and so
  // flips `neverOpened`. The InviteModal is therefore rendered once, outside this
  // branch (see the return), so that mid-flow flip can't unmount the one-time link.
  // Directly-invited students (rows > 0) must see the table even if applications
  // never opened — hence the rows.length guard.
  const neverOpened = !applicationOpen && applicationDeadline == null && rows.length === 0

  const funnel = lifecycleFunnel(apps, rollups)
  const activeStage = filter ? funnel.find((s) => s.key === filter) : undefined
  const filterLabel =
    filter && filter !== 'all' ? activeStage?.label ?? ACTION_ONLY_FILTER_LABELS[filter] ?? filter : null

  const filteredRows = lifecycleFilter(rows, filter, showClosed)
  const nClosed = closedCount(rows)

  const cards = lifecycleActionCards(apps, rollups, templates.length)
  const next = nextDeadline(rollups)
  const subline = lifecycleSubline(apps, rollups)

  function handleStageClick(key: string) {
    if (key === 'all') {
      setFilter(null)
      return
    }
    setFilter((cur) => (cur === key ? null : key))
  }

  return (
    <>
      {neverOpened ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-navy">
            Commencez votre échange
          </h1>
          <p className="mt-2 max-w-[420px] text-[15px] text-muted-foreground">
            Commencez votre échange en invitant vos élèves à postuler.
          </p>
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="mt-6 flex h-[42px] items-center gap-1.5 rounded-[9px] bg-brand px-5 text-[14px] font-semibold text-white hover:bg-brand-hover"
          >
            <span className="text-base leading-none">+</span> Inviter vos élèves à postuler
          </button>
        </div>
      ) : (
        <div>
      <div className="mb-[22px]">
        <h1 className="font-display text-[26px] font-bold tracking-tight">Vue d&apos;ensemble</h1>
        <p className="text-sm text-muted-foreground">{subline}</p>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Funnel card */}
          <div className="bg-card border rounded-[14px] p-[18px] px-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
                Progression de l&apos;échange
              </span>
              {filterLabel && (
                <button
                  type="button"
                  onClick={() => setFilter(null)}
                  className="border bg-hint rounded-pill px-[11px] py-1 text-[11px] font-medium text-muted-foreground"
                >
                  Filtre : {filterLabel} ✕
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2.5 mt-3">
              {funnel.map((stage) => {
                const isActive = filter === stage.key
                return (
                  <button
                    key={stage.key}
                    type="button"
                    onClick={() => handleStageClick(stage.key)}
                    className={`flex flex-col items-start gap-1 rounded-[10px] border px-3.5 py-2.5 min-w-[96px] ${
                      isActive ? 'border-brand bg-tint/40' : ''
                    }`}
                  >
                    <span className={`font-display text-[22px] font-bold leading-none ${isActive ? 'text-brand' : 'text-navy'}`}>
                      {stage.display ?? stage.count}
                    </span>
                    <span className="text-[11.5px] text-muted-foreground">{stage.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Lifecycle table card */}
          <div className="bg-card border rounded-[14px] overflow-hidden">
            <div className={`grid ${GRID} font-mono text-[10px] uppercase tracking-[.08em] text-tertiary bg-[#FBFCFE] border-b px-5 py-2.5`}>
              <span>Élève</span>
              <span>Candidature</span>
              <span>Formulaires</span>
              <span>Documents</span>
              <span>Statut</span>
              <span>&rsaquo;</span>
            </div>

            {filteredRows.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">Aucun élève ne correspond à ce filtre.</p>
            )}
            {filteredRows.map((row) => (
              <div
                key={row.key}
                onClick={() => setSelected(rowSubject(row))}
                className={`grid ${GRID} px-5 py-3 text-sm border-b last:border-0 hover:bg-hoverrow-soft cursor-pointer`}
              >
                <span className="font-medium text-navy">{row.name}</span>
                <span>
                  <StatusPill pill={row.candidature} />
                </span>
                <span>
                  {row.kind === 'enrolled' ? <StatusPill pill={formsPill(row.rollup.forms)} /> : <span className="text-placeholder">—</span>}
                </span>
                <span>
                  {row.kind === 'enrolled' ? <StatusPill pill={docsPill(row.rollup.docs)} /> : <span className="text-placeholder">—</span>}
                </span>
                <span>
                  <StatusPill pill={row.kind === 'enrolled' ? row.rollup.overall : row.statut} />
                </span>
                <span className="text-placeholder">&rsaquo;</span>
              </div>
            ))}

            {nClosed > 0 && (
              <div className="border-t px-5 py-3">
                <button
                  type="button"
                  onClick={() => setShowClosed((v) => !v)}
                  className="text-[12.5px] text-muted-foreground underline-offset-2 hover:underline"
                >
                  {showClosed ? 'Masquer les refusés et déclinés' : `Afficher les refusés et déclinés (${nClosed})`}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right rail — only the « À faire maintenant » action cards */}
        <div className="w-full xl:w-[344px] flex-none flex flex-col gap-3">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
            À faire maintenant
          </span>
          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tout est à jour ✓{next ? ` — prochaine échéance le ${frShortDate(next)}.` : ''}
            </p>
          ) : (
            cards.map((card) => (
              <div
                key={card.filterKey}
                className={`bg-card border rounded-[12px] p-[17px] pl-[19px] flex flex-col gap-1.5 border-l-[3px] ${ACTION_BORDER[card.tone]}`}
              >
                <span className="text-sm font-semibold text-navy">{card.title}</span>
                <span className="text-[12.5px] text-muted-foreground">{card.desc}</span>
                {card.href ? (
                  <Link
                    href={card.href}
                    className={`self-start rounded-[8px] px-[15px] py-2 text-[12.5px] font-semibold ${ACTION_CTA[card.tone]}`}
                  >
                    {card.cta}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFilter(card.filterKey)}
                    className={`self-start rounded-[8px] px-[15px] py-2 text-[12.5px] font-semibold ${ACTION_CTA[card.tone]}`}
                  >
                    {card.cta}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <StudentDrawer subject={selected} onClose={() => setSelected(null)} />
        </div>
      )}
      <InviteModal exchangeId={exchangeId} applySlug={applySlug} open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  )
}
