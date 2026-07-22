// The activation gate and the publish itself, lifted verbatim out of the old
// `activateTemplate` server action. It lives outside a 'use server' module so
// the add paths (addStandardTemplate / createDraftTemplate / addField) can
// call it in-request and so it stays directly unit-testable. Callers own the
// auth preamble, assertExchangeWritable and revalidatePath.
//
// The gate is deliberately kept intact even though the add UI now collects
// every input it demands: a bug in that UI must degrade to a template that
// stays `draft`, never to a half-configured template published to families.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TemplateActionResult } from '@/lib/forms/template-result'
import { MSG_DEADLINE_REQUIRED, MSG_PDF_REQUIRED, MSG_QUESTIONS_REQUIRED } from '@/lib/forms/template-result'
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import { missingDetailLabels } from '@/lib/forms/fillable/render'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'
import type { TemplateKind } from '@/lib/forms/rollup'

// Structurally satisfied by what actions/forms.ts's getOwnedTemplate selects.
export type ActivatableTemplate = {
  id: string
  exchange_id: string
  school_id: string
  kind: TemplateKind
  status: 'draft' | 'active'
  audience: 'all' | 'conditional'
  deadline: string | null
  standard_key: string | null
  template_file_path: string | null
  form_fields?: { id: string }[] | null
}

export async function activateTemplateRecord(
  supabase: SupabaseClient,
  tmpl: ActivatableTemplate,
  studentIds?: string[],
): Promise<TemplateActionResult> {
  if (tmpl.status === 'active') return { ok: true }

  if (!tmpl.deadline) return { ok: false, message: MSG_DEADLINE_REQUIRED }
  if (tmpl.kind === 'pdf' && !tmpl.template_file_path) return { ok: false, message: MSG_PDF_REQUIRED }
  if (tmpl.kind === 'online' && (tmpl.form_fields ?? []).length === 0) return { ok: false, message: MSG_QUESTIONS_REQUIRED }

  if (tmpl.kind === 'fillable') {
    const def = tmpl.standard_key && Object.hasOwn(FILLABLE_DEFINITIONS, tmpl.standard_key)
      ? FILLABLE_DEFINITIONS[tmpl.standard_key]
      : undefined
    if (!def) return { ok: false, message: 'Modèle à signer inconnu.' }
    const { data: details } = await supabase
      .from('exchange_program_details').select('*')
      .eq('exchange_id', tmpl.exchange_id).maybeSingle<ProgramDetailsValues>()
    const missing = missingDetailLabels(def, details ?? null)
    if (missing.length > 0) {
      return {
        ok: false,
        message: `Complétez d’abord les détails du programme (Réglages → Programme) : ${missing.join(', ')}.`,
      }
    }
  }

  let chosen: string[] = []
  if (tmpl.audience === 'conditional') {
    if (!studentIds || studentIds.length === 0) return { ok: false, message: 'Choisissez au moins un élève concerné.' }
    // Only enrolled students of our school may be targeted.
    const { data: enrollments } = await supabase
      .from('exchange_enrollments').select('user_id').eq('exchange_id', tmpl.exchange_id)
    const enrolledIds = new Set((enrollments ?? []).map((e) => e.user_id))
    const { data: validUsers } = await supabase
      .from('users').select('id')
      .in('id', studentIds).eq('school_id', tmpl.school_id).eq('role', 'student')
    const validIds = new Set((validUsers ?? []).map((u) => u.id))
    chosen = studentIds.filter(sid => enrolledIds.has(sid) && validIds.has(sid))
    if (chosen.length !== studentIds.length) return { ok: false, message: 'Sélection invalide : élève non inscrit à cet échange.' }
  }

  const { error } = await supabase.from('form_templates').update({ status: 'active' }).eq('id', tmpl.id)
  if (error) throw error

  if (tmpl.audience === 'conditional' && chosen.length > 0) {
    const { error: insertError } = await supabase
      .from('assignments')
      .insert(chosen.map(sid => ({ template_id: tmpl.id, student_id: sid })))
    if (insertError) throw insertError
  }

  return { ok: true }
}
