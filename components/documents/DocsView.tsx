'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { type TemplateVM } from '@/lib/forms/rollup'
import { TemplateGrid } from '@/components/forms/TemplateGrid'
import { TemplateCard } from '@/components/forms/TemplateCard'
import { LibraryDrawer } from '@/components/forms/LibraryDrawer'
import { DocDrawer } from './DocDrawer'

export function DocsView({
  exchangeId, templates, enrolledStudents,
}: {
  exchangeId: string
  templates: TemplateVM[]
  enrolledStudents: { id: string; full_name: string }[]
}) {
  const [showLibrary, setShowLibrary] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const t = useTranslations('organizer')
  const c = useTranslations('common')

  const open = openId ? templates.find(tpl => tpl.id === openId) ?? null : null
  const existingKeys = templates
    .map(tpl => tpl.standard_key)
    .filter((k): k is string => k !== null)

  return (
    <div className="max-w-[1040px]">
      <div className="mb-[22px]">
        <h1 className="font-display text-[26px] font-bold leading-[1.1] tracking-[-.02em]">{t('documents.title')}</h1>
      </div>

      <div className="mb-3.5 flex items-center justify-between">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
          {t('documents.requestedHeading', { count: templates.length })}
        </div>
        <button type="button" onClick={() => setShowLibrary(true)}
          className="inline-flex items-center gap-[7px] rounded-[9px] bg-brand px-[15px] py-[9px] text-[13px] font-semibold text-white hover:bg-brand-hover">
          <span className="text-[15px] leading-none">+</span> {c('actions.add')}
        </button>
      </div>

      <TemplateGrid>
        {templates.map(tpl => (
          <TemplateCard key={tpl.id} vm={tpl} onOpen={() => setOpenId(tpl.id)} />
        ))}
      </TemplateGrid>

      {showLibrary && (
        <LibraryDrawer family="docs" exchangeId={exchangeId} existingKeys={existingKeys}
          onClose={() => setShowLibrary(false)}
          onAdded={(id) => { setShowLibrary(false); setOpenId(id) }} />
      )}
      <DocDrawer vm={open} exchangeId={exchangeId} enrolledStudents={enrolledStudents} onClose={() => setOpenId(null)} />
    </div>
  )
}
