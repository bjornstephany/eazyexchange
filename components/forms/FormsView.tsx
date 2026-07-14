'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { typePill, statusPill, progressLabel, progressPct, formsStats, type TemplateVM } from '@/lib/forms/rollup'
import { TemplateIcon } from './TemplateIcon'
import { StatsCard } from './StatsCard'
import { PageBanner } from './PageBanner'
import { AddFormPanel } from './AddFormPanel'
import { FormDrawer } from './FormDrawer'
import { DeleteTemplateButton } from './DeleteTemplateButton'

export function FormsView({
  exchangeId, templates, studentCount,
}: {
  exchangeId: string
  templates: TemplateVM[]
  studentCount: number
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const t = useTranslations('organizer')

  const visible = templates
  const stats = formsStats(templates)
  const open = openId ? templates.find(tpl => tpl.id === openId) ?? null : null

  return (
    <div className="max-w-[1040px]">
      <div className="mb-[22px]">
        <h1 className="mb-[5px] font-display text-[26px] font-bold leading-[1.1] tracking-[-.02em]">{t('forms.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('forms.subtitle')}
        </p>
      </div>

      <StatsCard
        stats={[
          { value: String(stats.activeCount), label: t('forms.activeFormsCount', { count: stats.activeCount }) },
          { value: String(studentCount), label: t('forms.studentsConcerned') },
          { value: t('forms.requestedInValue'), label: t('forms.requestedInLabel') },
        ]}
        barLabel={t('forms.responsesReceivedLabel')} done={stats.done} total={stats.total}
      />
      <PageBanner text={t('forms.autoSendBanner')} />

      <div className="mb-3.5 flex items-center justify-between">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
          {t('forms.yourFormsCount', { count: templates.length })}
        </div>
        <button type="button" onClick={() => setShowAdd(s => !s)}
          className="inline-flex items-center gap-[7px] rounded-[9px] border border-frame-dashed bg-card px-[15px] py-[9px] text-[13px] font-semibold text-navy hover:bg-hoverrow">
          <span className="text-[15px] leading-none">+</span> {t('forms.addFormLabel')}
        </button>
      </div>

      {showAdd && (
        <AddFormPanel exchangeId={exchangeId} onClose={() => setShowAdd(false)}
          onCreated={(id) => { setShowAdd(false); setOpenId(id) }} />
      )}

      <div className="flex flex-col gap-3">
        {visible.map(tpl => (
          <div key={tpl.id} className="flex items-center justify-between gap-5 rounded-[14px] border bg-card px-5 py-[18px]">
            <div className="flex min-w-0 flex-1 gap-[15px]">
              <TemplateIcon kind={tpl.kind} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-[9px]">
                  <span className="font-display text-base font-semibold text-navy">{tpl.name}</span>
                  <StatusPill pill={typePill(tpl.kind)} />
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-placeholder">
                    {tpl.standard_key ? t('forms.standardBadge') : t('forms.customBadge')}
                  </span>
                </div>
                {tpl.description && (
                  <div className="mt-[5px] max-w-[520px] text-[13px] leading-normal text-muted-foreground">{tpl.description}</div>
                )}
              </div>
            </div>
            <div className="flex flex-none items-center gap-[22px]">
              {tpl.status === 'active' ? (
                <div className="w-[150px]">
                  <div className="mb-1.5 text-right font-mono text-[11px] font-medium text-tertiary">{progressLabel(tpl)}</div>
                  <div className="h-1.5 overflow-hidden rounded-pill bg-background">
                    <div className="h-full rounded-pill bg-brand" style={{ width: `${progressPct(tpl)}%` }} />
                  </div>
                </div>
              ) : (
                <span className="w-[150px] text-right text-xs font-medium text-placeholder">{progressLabel(tpl)}</span>
              )}
              <StatusPill pill={statusPill(tpl.status)} />
              <div className="flex flex-none gap-2">
                <button type="button" onClick={() => setOpenId(tpl.id)}
                  className="rounded-lg border border-frame-dashed bg-card px-3.5 py-2 text-[12.5px] font-semibold text-navy hover:bg-hoverrow">
                  {t('forms.previewButton')}
                </button>
                <a href={`/forms/${tpl.id}`}
                  className="rounded-lg bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-navy">
                  {t('forms.editButton')}
                </a>
                {tpl.standard_key === null && (
                  <DeleteTemplateButton templateId={tpl.id}
                    confirmText={t('forms.deleteConfirm')} />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <FormDrawer vm={open} onClose={() => setOpenId(null)} />
    </div>
  )
}
