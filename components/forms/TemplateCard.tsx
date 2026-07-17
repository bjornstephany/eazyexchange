'use client'
import { useTranslations } from 'next-intl'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { typePill, statusPill, reqPill, type TemplateVM } from '@/lib/forms/rollup'
import { previewMode, cardCountLabel } from '@/lib/forms/card'
import { TemplateThumbnail } from './TemplateThumbnail'

// Portrait « A4 paper » card (approved mockup option C v2): preview zone on
// top showing the document itself, then name, type pill and response count.
// The status chip overlays the preview top-right. No buttons — clicking
// anywhere opens the existing detail drawer (Aperçu / Modifier / Supprimer /
// Télécharger live there). The layout deliberately leaves room for a future
// « convertir » action.
export function TemplateCard({ vm, onOpen }: { vm: TemplateVM; onOpen: () => void }) {
  const t = useTranslations('organizer')
  const tr = useTranslations()
  const mode = previewMode(vm)

  return (
    <button type="button" onClick={onOpen}
      className="group overflow-hidden rounded-xl border bg-card text-left transition-shadow hover:shadow-modal">
      <div className={`relative mx-3 mt-3 aspect-[210/260] overflow-hidden rounded-[3px] p-2.5 ${
        mode === 'pdf-missing'
          ? 'border border-dashed border-frame bg-hoverrow'
          : 'border bg-card shadow-sm'
      }`}>
        {mode === 'pdf-file' && (
          <TemplateThumbnail templateId={vm.id} filePath={vm.template_file_path!}
            alt={vm.name} fallback={<GenericPaper />} />
        )}
        {mode === 'pdf-missing' && (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-placeholder">
            <span aria-hidden="true" className="text-lg leading-none">⤒</span>
            <span className="text-[10px] font-medium">{t('templateCard.pdfMissing')}</span>
          </div>
        )}
        {mode === 'online-paper' && <PaperFields fields={vm.fields} />}
        {mode === 'doc-placeholder' && (
          <div className="flex h-full flex-col items-center justify-center gap-1.5">
            <div className="flex h-[60px] w-[46px] flex-none flex-col items-center justify-center gap-1 rounded bg-rail">
              <div className="h-4 w-4 rounded-full border-2 border-white/60" />
              <div className="h-[3px] w-6 rounded-sm bg-white/60" />
            </div>
            <span className="text-[10px] font-medium text-placeholder">{t('templateCard.docPlaceholder')}</span>
          </div>
        )}
        <span className="absolute right-2 top-2">
          <StatusPill pill={statusPill(vm.status, tr)} />
        </span>
      </div>
      <div className="p-3">
        <div className="mb-1.5 line-clamp-2 font-display text-[13px] font-semibold leading-snug text-navy">
          {vm.name}
        </div>
        <div className="flex items-center justify-between gap-2">
          <StatusPill pill={vm.kind === 'doc' ? reqPill(vm, tr) : typePill(vm.kind, tr)} />
          <span className="font-mono text-[10.5px] font-semibold text-tertiary">{cardCountLabel(vm, tr)}</span>
        </div>
      </div>
    </button>
  )
}

// « Paper » mini-page for online forms: the template's REAL field labels as
// tiny form rows (pure CSS/JSX from the fields getTemplatesPage already
// returns). First 4 labels; skeleton lines when the draft has none yet.
function PaperFields({ fields }: { fields: string[] }) {
  return (
    <div className="flex h-full flex-col gap-1.5 overflow-hidden">
      <div aria-hidden="true" className="mb-1 h-2 w-2/3 rounded-sm bg-frame" />
      {fields.slice(0, 4).map((label, i) => (
        <div key={i}>
          <div className="mb-0.5 truncate text-[7.5px] font-medium leading-tight text-muted-foreground">{label}</div>
          <div aria-hidden="true" className="h-2.5 rounded-[2px] border border-frame" />
        </div>
      ))}
      {fields.length === 0 && (
        <div aria-hidden="true" className="flex flex-col gap-1.5">
          <div className="h-1.5 w-4/5 rounded-sm bg-background" />
          <div className="h-1.5 w-3/5 rounded-sm bg-background" />
          <div className="h-1.5 w-4/6 rounded-sm bg-background" />
        </div>
      )}
      {fields.length > 4 && <div aria-hidden="true" className="h-1.5 w-1/3 rounded-sm bg-background" />}
    </div>
  )
}

// Stylized generic page — the silent fallback when a real thumbnail can't be
// rendered. Exported for TemplateThumbnail's fallback prop reuse in views.
export function GenericPaper() {
  return (
    <div aria-hidden="true" className="flex h-full flex-col gap-1.5 overflow-hidden">
      <div className="mb-1 h-2 w-1/2 rounded-sm bg-frame" />
      <div className="h-1.5 w-[90%] rounded-sm bg-background" />
      <div className="h-1.5 w-[82%] rounded-sm bg-background" />
      <div className="h-1.5 w-[88%] rounded-sm bg-background" />
      <div className="mt-1 rounded-[2px] border border-frame p-1">
        <div className="mb-1 h-1.5 w-[70%] rounded-sm bg-background" />
        <div className="h-1.5 w-[55%] rounded-sm bg-background" />
      </div>
      <div className="mt-1.5 h-1.5 w-1/3 rounded-sm bg-background" />
    </div>
  )
}
