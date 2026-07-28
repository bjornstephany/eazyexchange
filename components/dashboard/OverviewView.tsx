'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { longDate, shortDate } from '@/lib/dates'
import type { Locale } from '@/lib/i18n/config'
import type { AppRow, DossierRollup, TemplateInfo, CellMap, ActionCard, Pill, EnrolledStudent } from '@/lib/dashboard/rollup'
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
} from '@/lib/dashboard/rollup'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { StudentDrawer, type DrawerSubject } from '@/components/dashboard/StudentDrawer'

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

// gap-x-5 is load-bearing, not decoration: without it the Application column's
// status pill sits flush against the Forms column's em-dash placeholder.
const GRID = 'grid-cols-[1.7fr_1.15fr_1fr_1fr_1fr_22px] gap-x-5'

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

function checklistItemPill(group: 'form' | 'doc', status: string | undefined, c: ReturnType<typeof useTranslations>): Pill {
  if (status === 'approved') return { kind: 'ok', label: group === 'form' ? c('status.received') : c('status.provided') }
  if (status === 'submitted') return { kind: 'info', label: c('status.toVerify') }
  if (status === 'draft' || status === 'rejected') return { kind: 'warn', label: c('status.inProgress') }
  return { kind: 'bad', label: c('status.missing') }
}

export function OverviewView(props: OverviewProps) {
  const { exchangeId, apps, students, rollups, templates, cellMap, applicationOpen, applicationDeadline, applySlug } = props
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const tr = useTranslations()
  const locale = useLocale() as Locale
  const router = useRouter()
  const [filter, setFilter] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const [selected, setSelected] = useState<DrawerSubject | null>(null)

  function studentSubject(rollup: DossierRollup): DrawerSubject {
    const items = templates.map((tmpl) => {
      const group: 'form' | 'doc' = tmpl.type === 'data_entry' ? 'form' : 'doc'
      const status = cellMap[`${rollup.studentId}:${tmpl.id}`]?.status
      return { label: tmpl.name, group, pill: checklistItemPill(group, status, c) }
    })
    return { rollup, items }
  }

  const rows = buildLifecycleRows(apps, students, rollups, tr)

  // Directly-invited students (rows > 0) must see the table even if applications
  // never opened — hence the rows.length guard.
  const neverOpened = !applicationOpen && applicationDeadline == null && rows.length === 0

  const funnel = lifecycleFunnel(apps, rows, rollups, tr)
  const activeStage = filter ? funnel.find((s) => s.key === filter) : undefined
  // Labels for filter keys that only exist on action cards, not as funnel tiles.
  function actionOnlyFilterLabel(key: string): string | undefined {
    if (key === 'maybe') return t('dashboard.filterLabelMaybe')
    if (key === 'missingdocs') return t('dashboard.filterLabelMissingDocs')
    return undefined
  }

  const filterLabel =
    filter && filter !== 'all' ? activeStage?.label ?? actionOnlyFilterLabel(filter) ?? filter : null

  const filteredRows = lifecycleFilter(rows, filter, showClosed)
  const nClosed = closedCount(rows)

  const cards = lifecycleActionCards(apps, rollups, templates.length, tr)
  const next = nextDeadline(rollups)
  const subline = lifecycleSubline(apps, rollups, tr)

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
            {t('dashboard.startTitle')}
          </h1>
          <p className="mt-2 max-w-[420px] text-[15px] text-muted-foreground">
            {t('dashboard.startBody')}
          </p>
          <Link
            href="/applications"
            className="mt-6 flex h-[42px] items-center rounded-[9px] bg-brand px-5 text-[14px] font-semibold text-white hover:bg-brand-hover"
          >
            {t('dashboard.inviteCta')}
          </Link>
        </div>
      ) : (
        <div data-testid="overview">
      <div className="mb-[22px]">
        <h1 className="font-display text-[26px] font-bold tracking-tight">{t('dashboard.overviewTitle')}</h1>
        <p className="text-sm text-muted-foreground">{subline}</p>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Funnel card */}
          <div className="bg-card border rounded-[14px] p-[18px] px-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
                {t('dashboard.progressLabel')}
              </span>
              {filterLabel && (
                <button
                  type="button"
                  onClick={() => setFilter(null)}
                  className="border bg-hint rounded-pill px-[11px] py-1 text-[11px] font-medium text-muted-foreground"
                >
                  {t('dashboard.filterBadge', { label: filterLabel })}
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
              <span>{t('dashboard.tableHeaderStudent')}</span>
              <span>{t('dashboard.tableHeaderApplication')}</span>
              <span>{t('dashboard.tableHeaderForms')}</span>
              <span>{t('dashboard.tableHeaderDocs')}</span>
              <span>{t('dashboard.tableHeaderStatus')}</span>
              <span>&rsaquo;</span>
            </div>

            {filteredRows.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">{t('dashboard.noRowsMatch')}</p>
            )}
            {filteredRows.map((row) => (
              <div
                key={row.key}
                data-testid="lifecycle-row"
                onClick={() =>
                  row.kind === 'applicant'
                    ? router.push(`/applications?id=${row.app.id}`)
                    : setSelected(studentSubject(row.rollup))
                }
                className={`grid ${GRID} px-5 py-3 text-sm border-b last:border-0 hover:bg-hoverrow-soft cursor-pointer`}
              >
                <span className="font-medium text-navy">{row.name}</span>
                <span className="flex items-center gap-2">
                  <StatusPill pill={row.candidature} />
                  {row.respondedAt && (
                    <span
                      className="whitespace-nowrap text-[11.5px] text-muted-foreground"
                      title={longDate(row.respondedAt, locale)}
                    >
                      {shortDate(row.respondedAt, locale, { year: true })}
                    </span>
                  )}
                </span>
                <span>
                  {row.kind === 'enrolled' ? <StatusPill pill={formsPill(row.rollup.forms, tr)} /> : <span className="text-placeholder">—</span>}
                </span>
                <span>
                  {row.kind === 'enrolled' ? <StatusPill pill={docsPill(row.rollup.docs, tr)} /> : <span className="text-placeholder">—</span>}
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
                  {showClosed ? t('dashboard.hideClosed') : t('dashboard.showClosed', { n: nClosed })}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right rail — only the « À faire maintenant » action cards */}
        <div className="w-full xl:w-[344px] flex-none flex flex-col gap-3">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
            {t('dashboard.actionsHeading')}
          </span>
          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('dashboard.upToDate')}
              {next ? t('dashboard.nextDeadlineSuffix', { date: shortDate(next, locale) }) : ''}
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
    </>
  )
}
