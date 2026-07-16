'use client'
import { useState } from 'react'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { reqPill, progressLabel, progressPct, docAttentionPill, docsStats, earliestActiveDeadline, type TemplateVM } from '@/lib/forms/rollup'
import { frShortDate } from '@/lib/dashboard/rollup'
import { TemplateIcon } from '@/components/forms/TemplateIcon'
import { StatsCard } from '@/components/forms/StatsCard'
import { PageBanner } from '@/components/forms/PageBanner'
import { AddDocPanel } from './AddDocPanel'
import { DocDrawer } from './DocDrawer'
import { DeleteTemplateButton } from '@/components/forms/DeleteTemplateButton'

export function DocsView({
  exchangeId, templates, studentCount, enrolledStudents,
}: {
  exchangeId: string
  templates: TemplateVM[]
  studentCount: number
  enrolledStudents: { id: string; full_name: string }[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const visible = templates
  const stats = docsStats(templates)
  const open = openId ? templates.find(t => t.id === openId) ?? null : null
  const due = earliestActiveDeadline(templates)

  return (
    <div className="max-w-[1040px]">
      <div className="mb-[22px]">
        <h1 className="mb-[5px] font-display text-[26px] font-bold leading-[1.1] tracking-[-.02em]">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Les pièces justificatives que les familles téléversent pour compléter le dossier. Utilisez la liste standard ou demandez les vôtres.
        </p>
      </div>

      <StatsCard
        stats={[
          { value: String(stats.docCount), label: 'Documents demandés' },
          { value: String(studentCount), label: 'Élèves concernés' },
          { value: String(stats.reviewCount), label: 'Pièces à vérifier' },
        ]}
        barLabel="Pièces reçues" done={stats.done} total={stats.total}
      />
      <PageBanner text={`Chaque pièce téléversée est mise en file de vérification. Les familles sont relancées automatiquement pour les pièces manquantes${due ? ` jusqu’à l’échéance du ${frShortDate(due)}` : ''}.`} />

      <div className="mb-3.5 flex items-center justify-between">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
          Pièces demandées · {templates.length}
        </div>
        <button type="button" onClick={() => setShowAdd(s => !s)}
          className="inline-flex items-center gap-[7px] rounded-[9px] border border-frame-dashed bg-card px-[15px] py-[9px] text-[13px] font-semibold text-navy hover:bg-hoverrow">
          <span className="text-[15px] leading-none">+</span> Demander un document
        </button>
      </div>

      {showAdd && (
        <AddDocPanel exchangeId={exchangeId} onClose={() => setShowAdd(false)}
          onCreated={(id) => { setShowAdd(false); setOpenId(id) }} />
      )}

      <div className="flex flex-col gap-3">
        {visible.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-5 rounded-[14px] border bg-card px-5 py-[18px]">
            <div className="flex min-w-0 flex-1 items-center gap-[15px]">
              <TemplateIcon kind="doc" className={t.audience === 'conditional' ? 'bg-muted-foreground' : undefined} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-[9px]">
                  <span className="font-display text-base font-semibold text-navy">{t.name}</span>
                  <StatusPill pill={reqPill(t)} />
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-placeholder">
                    {t.standard_key ? 'STANDARD' : 'PERSONNALISÉ'}
                  </span>
                </div>
                {t.description && (
                  <div className="mt-[5px] max-w-[520px] text-[13px] leading-normal text-muted-foreground">{t.description}</div>
                )}
              </div>
            </div>
            <div className="flex flex-none items-center gap-[22px]">
              <div className="w-[150px]">
                <div className="mb-1.5 text-right font-mono text-[11px] font-medium text-tertiary">{progressLabel(t)}</div>
                <div className="h-1.5 overflow-hidden rounded-pill bg-background">
                  <div className="h-full rounded-pill bg-brand" style={{ width: `${progressPct(t)}%` }} />
                </div>
              </div>
              <StatusPill pill={docAttentionPill(t)} />
              <div className="flex flex-none gap-2">
                <button type="button" onClick={() => setOpenId(t.id)}
                  className="rounded-lg border border-frame-dashed bg-card px-3.5 py-2 text-[12.5px] font-semibold text-navy hover:bg-hoverrow">
                  Détail
                </button>
                <a href={`/documents/${t.id}`}
                  className="rounded-lg bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-navy">
                  Modifier
                </a>
                <DeleteTemplateButton templateId={t.id}
                  confirmText="Supprimer cette pièce ? Les fichiers déjà envoyés par les familles seront définitivement supprimés." />
              </div>
            </div>
          </div>
        ))}
      </div>

      <DocDrawer vm={open} exchangeId={exchangeId} enrolledStudents={enrolledStudents} onClose={() => setOpenId(null)} />
    </div>
  )
}
