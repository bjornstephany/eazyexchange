'use client'
import { useEffect, useRef, useState } from 'react'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { useShellUi } from '@/components/shell/ShellUiContext'
import { typePill, statusPill, progressLabel, progressPct, formsStats, type TemplateVM } from '@/lib/forms/rollup'
import { p } from '@/lib/dashboard/rollup'
import { TemplateIcon } from './TemplateIcon'
import { StatsCard } from './StatsCard'
import { PageBanner } from './PageBanner'
import { AddFormPanel } from './AddFormPanel'
import { FormDrawer } from './FormDrawer'

export function FormsView({
  exchangeId, templates, studentCount,
}: {
  exchangeId: string
  templates: TemplateVM[]
  studentCount: number
}) {
  const { listSearch, addRequestId } = useShellUi()
  const [showAdd, setShowAdd] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const lastAddRequest = useRef(addRequestId)

  // Top-bar « + Nouveau formulaire » bumps addRequestId → open the panel.
  useEffect(() => {
    if (addRequestId !== lastAddRequest.current) {
      lastAddRequest.current = addRequestId
      setShowAdd(true)
    }
  }, [addRequestId])

  const q = listSearch.trim().toLowerCase()
  const visible = q ? templates.filter(t => t.name.toLowerCase().includes(q)) : templates
  const stats = formsStats(templates)
  const open = openId ? templates.find(t => t.id === openId) ?? null : null

  return (
    <div className="max-w-[1040px]">
      <div className="mb-[22px]">
        <h1 className="mb-[5px] font-display text-[26px] font-bold leading-[1.1] tracking-[-.02em]">Formulaires</h1>
        <p className="text-sm text-muted-foreground">
          Les documents et formulaires que les familles complètent pour valider le dossier de leur enfant. Utilisez les modèles standard ou ajoutez les vôtres.
        </p>
      </div>

      <StatsCard
        stats={[
          { value: String(stats.activeCount), label: `Formulaire${p(stats.activeCount)} actif${p(stats.activeCount)}` },
          { value: String(studentCount), label: 'Élèves concernés' },
          { value: 'Phase 2', label: 'Demandés en' },
        ]}
        barLabel="Réponses reçues" done={stats.done} total={stats.total}
      />
      <PageBanner text="Les formulaires actifs sont envoyés automatiquement aux familles à l’ouverture de la Phase 2, avec relance jusqu’à réception." />

      <div className="mb-3.5 flex items-center justify-between">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
          Vos formulaires · {templates.length}
        </div>
        <button type="button" onClick={() => setShowAdd(s => !s)}
          className="inline-flex items-center gap-[7px] rounded-[9px] border border-frame-dashed bg-card px-[15px] py-[9px] text-[13px] font-semibold text-navy hover:bg-hoverrow">
          <span className="text-[15px] leading-none">+</span> Ajouter un formulaire
        </button>
      </div>

      {showAdd && (
        <AddFormPanel exchangeId={exchangeId} onClose={() => setShowAdd(false)}
          onCreated={(id) => setOpenId(id)} />
      )}

      <div className="flex flex-col gap-3">
        {visible.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-5 rounded-[14px] border bg-card px-5 py-[18px]">
            <div className="flex min-w-0 flex-1 gap-[15px]">
              <TemplateIcon kind={t.kind} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-[9px]">
                  <span className="font-display text-base font-semibold text-navy">{t.name}</span>
                  <StatusPill pill={typePill(t.kind)} />
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
              {t.status === 'active' ? (
                <div className="w-[150px]">
                  <div className="mb-1.5 text-right font-mono text-[11px] font-medium text-tertiary">{progressLabel(t)}</div>
                  <div className="h-1.5 overflow-hidden rounded-pill bg-background">
                    <div className="h-full rounded-pill bg-brand" style={{ width: `${progressPct(t)}%` }} />
                  </div>
                </div>
              ) : (
                <span className="w-[150px] text-right text-xs font-medium text-placeholder">{progressLabel(t)}</span>
              )}
              <StatusPill pill={statusPill(t.status)} />
              <div className="flex flex-none gap-2">
                <button type="button" onClick={() => setOpenId(t.id)}
                  className="rounded-lg border border-frame-dashed bg-card px-3.5 py-2 text-[12.5px] font-semibold text-navy hover:bg-hoverrow">
                  Aperçu
                </button>
                <a href={`/forms/${t.id}`}
                  className="rounded-lg bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-navy">
                  Modifier
                </a>
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && q && (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun résultat pour «&nbsp;{listSearch.trim()}&nbsp;»</p>
        )}
      </div>

      <FormDrawer vm={open} onClose={() => setOpenId(null)} />
    </div>
  )
}
