'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { type TemplateVM } from '@/lib/forms/rollup'
import { TemplateGrid } from './TemplateGrid'
import { TemplateCard } from './TemplateCard'
import { LibraryDrawer } from './LibraryDrawer'
import { FormDrawer } from './FormDrawer'
import { DocDrawer } from '@/components/documents/DocDrawer'

// Merged « Fichiers » page (replaces FormsView + DocsView): one « + Ajouter »
// button, two sections — Formulaires (online+pdf) then Documents demandés
// (doc) — over the shared grid/cards. The detail drawer opens by kind:
// FormDrawer for online/pdf, DocDrawer for doc.
export function FichiersView({
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

  const forms = templates.filter(tpl => tpl.kind !== 'doc')
  const docs = templates.filter(tpl => tpl.kind === 'doc')
  const open = openId ? templates.find(tpl => tpl.id === openId) ?? null : null
  const existingKeys = templates
    .map(tpl => tpl.standard_key)
    .filter((k): k is string => k !== null)

  return (
    <div className="max-w-[1040px]">
      <div className="mb-[22px] flex items-center justify-between">
        <h1 className="font-display text-[26px] font-bold leading-[1.1] tracking-[-.02em]">{t('files.title')}</h1>
        <button type="button" onClick={() => setShowLibrary(true)}
          className="inline-flex items-center gap-[7px] rounded-[9px] bg-brand px-[15px] py-[9px] text-[13px] font-semibold text-white hover:bg-brand-hover">
          <span className="text-[15px] leading-none">+</span> {c('actions.add')}
        </button>
      </div>

      <div className="mb-3.5 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
        {t('files.formsHeading', { count: forms.length })}
      </div>
      {forms.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t('files.formsEmpty')}</p>
      ) : (
        <TemplateGrid>
          {forms.map(tpl => (
            <TemplateCard key={tpl.id} vm={tpl} onOpen={() => setOpenId(tpl.id)} />
          ))}
        </TemplateGrid>
      )}

      <div className="mb-3.5 mt-8 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
        {t('files.docsHeading', { count: docs.length })}
      </div>
      {docs.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t('files.docsEmpty')}</p>
      ) : (
        <TemplateGrid>
          {docs.map(tpl => (
            <TemplateCard key={tpl.id} vm={tpl} onOpen={() => setOpenId(tpl.id)} />
          ))}
        </TemplateGrid>
      )}

      {showLibrary && (
        <LibraryDrawer exchangeId={exchangeId} existingKeys={existingKeys}
          onClose={() => setShowLibrary(false)}
          onAdded={(id) => { setShowLibrary(false); setOpenId(id) }} />
      )}
      <FormDrawer vm={open && open.kind !== 'doc' ? open : null} onClose={() => setOpenId(null)} />
      <DocDrawer vm={open && open.kind === 'doc' ? open : null} exchangeId={exchangeId}
        enrolledStudents={enrolledStudents} onClose={() => setOpenId(null)} />
    </div>
  )
}
