// Pure display logic for the portrait A4 template cards. No React, no
// Supabase — same testing pattern as lib/forms/rollup.ts.
import { progressLabel, type TemplateVM } from '@/lib/forms/rollup'
import type { useTranslations } from 'next-intl'

type T = ReturnType<typeof useTranslations<never>>

export type PreviewMode = 'pdf-file' | 'pdf-missing' | 'online-paper' | 'doc-sticker'

// Which preview the card's A4 zone shows (spec table): a real page-1
// thumbnail when the PDF exists, a dashed « PDF à joindre » when it doesn't
// yet, a CSS "paper" of the real field labels for online forms, and a cartoon
// sticker matched to the document for docs (students upload those — there is
// no organizer document to preview).
export function previewMode(t: Pick<TemplateVM, 'kind' | 'template_file_path'>): PreviewMode {
  if (t.kind === 'online' || t.kind === 'fillable') return 'online-paper'
  if (t.kind === 'doc') return 'doc-sticker'
  return t.template_file_path ? 'pdf-file' : 'pdf-missing'
}

// « x / y reçus » / « x / y fourni » for active templates, an em dash for drafts.
export function cardCountLabel(tpl: TemplateVM, t: T): string {
  if (tpl.status === 'draft') return '—'
  return progressLabel(tpl, t)
}
