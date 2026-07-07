'use server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FieldType } from '@/types/db'
import type { TemplateVM, AssigneeRow, TemplateKind } from '@/lib/forms/rollup'
import { sendTemplateReminderEmail } from '@/lib/email'
import { assertExchangeWritable } from '@/lib/exchange-guard'

// Throw unless the caller is an organizer. Returns the organizer's school_id.
async function assertOrganizer(supabase: SupabaseClient): Promise<string> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  return profile.school_id as string
}

// Throw unless the caller is an organizer for the school that owns the template.
async function assertOrganizerOwnsTemplate(
  supabase: SupabaseClient, templateId: string,
): Promise<{ exchangeId: string }> {
  const schoolId = await assertOrganizer(supabase)
  const { data: tmpl } = await supabase
    .from('form_templates').select('school_id, exchange_id').eq('id', templateId).maybeSingle()
  if (!tmpl || tmpl.school_id !== schoolId) throw new Error('Unauthorized')
  return { exchangeId: tmpl.exchange_id as string }
}

export async function getTemplate(id: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  await assertOrganizerOwnsTemplate(supabase, id)

  const { data, error } = await supabase
    .from('form_templates')
    .select('*, form_fields(*), document_slots(*)')
    .eq('id', id)
    .order('order', { referencedTable: 'form_fields', ascending: true })
    .order('order', { referencedTable: 'document_slots', ascending: true })
    .single() as any
  if (error) throw error
  return data as any
}

export async function addField(templateId: string, label: string, fieldType: FieldType, required: boolean, options?: string[]) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const { exchangeId } = await assertOrganizerOwnsTemplate(supabase, templateId)
  await assertExchangeWritable(supabase, exchangeId)

  const { data: existing } = await supabase
    .from('form_fields').select('order').eq('template_id', templateId).order('order', { ascending: false }).limit(1).single()
  const nextOrder = (existing?.order ?? -1) + 1
  const { error } = await supabase.from('form_fields').insert({
    template_id: templateId, label, field_type: fieldType,
    required, options: options ?? null, order: nextOrder,
  })
  if (error) throw error
  revalidatePath('/exchanges', 'layout')
}

export async function removeField(fieldId: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: field } = await supabase
    .from('form_fields').select('template_id').eq('id', fieldId).maybeSingle()
  if (!field) throw new Error('Field not found')
  const { exchangeId } = await assertOrganizerOwnsTemplate(supabase, field.template_id)
  await assertExchangeWritable(supabase, exchangeId)

  const { error } = await supabase.from('form_fields').delete().eq('id', fieldId)
  if (error) throw error
  revalidatePath('/exchanges', 'layout')
}

// Fetch a template the caller's school owns (with fields), or throw.
async function getOwnedTemplate(supabase: SupabaseClient, templateId: string) {
  const schoolId = await assertOrganizer(supabase)
  const { data: tmpl } = await supabase
    .from('form_templates')
    .select('id, exchange_id, school_id, name, kind, status, audience, deadline, standard_key, condition_label, template_file_path, form_fields(id)')
    .eq('id', templateId)
    .maybeSingle()
  if (!tmpl || tmpl.school_id !== schoolId) throw new Error('Unauthorized')
  return tmpl as any
}

const PDF_MAX_BYTES = 10 * 1024 * 1024

function requireValidPdf(file: File): void {
  if (file.type !== 'application/pdf') throw new Error('Le fichier doit être un PDF.')
  if (file.size > PDF_MAX_BYTES) throw new Error('Le PDF dépasse 10 Mo.')
}

async function uploadTemplatePdf(supabase: SupabaseClient, schoolId: string, templateId: string, file: File): Promise<string> {
  requireValidPdf(file)
  const path = `${schoolId}/${templateId}.pdf`
  const { error } = await supabase.storage
    .from('form-templates')
    .upload(path, file, { upsert: true, contentType: 'application/pdf' })
  if (error) throw new Error('Le téléversement du PDF a échoué. Réessayez.')
  return path
}

export async function createDraftTemplate(formData: FormData): Promise<string> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const schoolId = await assertOrganizer(supabase)

  const exchangeId = formData.get('exchange_id') as string
  await assertExchangeWritable(supabase, exchangeId)
  const kind = formData.get('kind') as TemplateKind
  const name = ((formData.get('name') as string) ?? '').trim()
  const deadline = ((formData.get('deadline') as string) ?? '').trim() || null
  const audience = (formData.get('audience') as string) === 'conditional' ? 'conditional' : 'all'
  const conditionLabel = ((formData.get('condition_label') as string) ?? '').trim() || null
  const file = formData.get('file') as File | null

  if (!['online', 'pdf', 'doc'].includes(kind)) throw new Error('Type de modèle invalide.')
  if (!name) throw new Error('Donnez un nom au modèle.')
  if (audience === 'conditional' && kind !== 'doc') throw new Error('Seules les pièces peuvent être conditionnelles.')
  if (kind === 'pdf') {
    if (!file || file.size === 0) throw new Error('Téléversez le PDF à faire signer.')
    requireValidPdf(file)
  }

  const { data, error } = await supabase.from('form_templates').insert({
    exchange_id: exchangeId,
    school_id: schoolId,
    name,
    description: null,
    type: kind === 'online' ? 'data_entry' : 'document_upload',
    kind,
    status: 'draft',
    audience,
    condition_label: audience === 'conditional' ? conditionLabel : null,
    deadline,
    created_by: user.id,
  }).select('id').single()
  if (error) throw error
  const templateId = data.id as string

  try {
    if (kind !== 'online') {
      const { error: slotError } = await supabase
        .from('document_slots')
        .insert({ template_id: templateId, label: name, description: null, required: true, order: 0 })
      if (slotError) throw slotError
    }
    if (kind === 'pdf' && file) {
      const path = await uploadTemplatePdf(supabase, schoolId, templateId, file)
      const { error: pathError } = await supabase
        .from('form_templates').update({ template_file_path: path }).eq('id', templateId)
      if (pathError) throw pathError
    }
  } catch (err) {
    // Don't leave a half-configured draft behind.
    await supabase.from('form_templates').delete().eq('id', templateId)
    throw err
  }

  revalidatePath(kind === 'doc' ? '/documents' : '/forms', 'layout')
  return templateId
}

export async function updateTemplateMeta(
  id: string,
  meta: { name: string; description: string | null; deadline: string | null; condition_label: string | null },
): Promise<void> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const tmpl = await getOwnedTemplate(supabase, id)
  await assertExchangeWritable(supabase, tmpl.exchange_id)

  const name = meta.name.trim()
  if (!name) throw new Error('Le nom ne peut pas être vide.')
  if (tmpl.status === 'active' && !meta.deadline) throw new Error('Un modèle actif doit garder une échéance.')

  const { error } = await supabase.from('form_templates').update({
    name,
    description: meta.description?.trim() || null,
    deadline: meta.deadline || null,
    condition_label: tmpl.audience === 'conditional' ? (meta.condition_label?.trim() || null) : null,
  }).eq('id', id)
  if (error) throw error
  revalidatePath(tmpl.kind === 'doc' ? '/documents' : '/forms', 'layout')
}

export async function replaceTemplateFile(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const id = formData.get('template_id') as string
  const file = formData.get('file') as File | null
  const tmpl = await getOwnedTemplate(supabase, id)
  await assertExchangeWritable(supabase, tmpl.exchange_id)
  if (tmpl.kind !== 'pdf') throw new Error('Ce modèle n’a pas de PDF.')
  if (!file || file.size === 0) throw new Error('Choisissez un fichier PDF.')

  const path = await uploadTemplatePdf(supabase, tmpl.school_id, id, file)
  const { error } = await supabase.from('form_templates').update({ template_file_path: path }).eq('id', id)
  if (error) throw error
  revalidatePath('/forms', 'layout')
}

export async function activateTemplate(id: string, studentIds?: string[]): Promise<void> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const tmpl = await getOwnedTemplate(supabase, id)
  await assertExchangeWritable(supabase, tmpl.exchange_id)
  if (tmpl.status === 'active') return

  if (!tmpl.deadline) throw new Error('Ajoutez une échéance avant d’activer.')
  if (tmpl.kind === 'pdf' && !tmpl.template_file_path) throw new Error('Téléversez le PDF avant d’activer.')
  if (tmpl.kind === 'online' && (tmpl.form_fields ?? []).length === 0) throw new Error('Ajoutez au moins une question avant d’activer.')

  let chosen: string[] = []
  if (tmpl.audience === 'conditional') {
    if (!studentIds || studentIds.length === 0) throw new Error('Choisissez au moins un élève concerné.')
    // Only enrolled students of our school may be targeted.
    const { data: enrollments } = await supabase
      .from('exchange_enrollments').select('user_id').eq('exchange_id', tmpl.exchange_id)
    const enrolledIds = new Set((enrollments ?? []).map((e: any) => e.user_id))
    const { data: validUsers } = await supabase
      .from('users').select('id')
      .in('id', studentIds).eq('school_id', tmpl.school_id).eq('role', 'student')
    const validIds = new Set((validUsers ?? []).map((u: any) => u.id))
    chosen = studentIds.filter(sid => enrolledIds.has(sid) && validIds.has(sid))
    if (chosen.length !== studentIds.length) throw new Error('Sélection invalide : élève non inscrit à cet échange.')
  }

  const { error } = await supabase.from('form_templates').update({ status: 'active' }).eq('id', id)
  if (error) throw error

  if (tmpl.audience === 'conditional' && chosen.length > 0) {
    const { error: insertError } = await supabase
      .from('assignments')
      .insert(chosen.map(sid => ({ template_id: id, student_id: sid })))
    if (insertError) throw insertError
  }

  // Exchange already in Phase 2 → tell the newly assigned students now
  // (otherwise the Phase-2 checklist email / daily cron covers it).
  const { data: exchange } = await supabase
    .from('exchanges').select('phase, name').eq('id', tmpl.exchange_id).single()
  if (exchange?.phase === 2) {
    await notifyIncompleteAssignees(supabase, { ...tmpl, status: 'active' }, exchange.name, 0)
  }

  revalidatePath(tmpl.kind === 'doc' ? '/documents' : '/forms', 'layout')
}

export async function deleteTemplate(id: string): Promise<void> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const tmpl = await getOwnedTemplate(supabase, id)
  await assertExchangeWritable(supabase, tmpl.exchange_id)
  if (tmpl.standard_key) throw new Error('Les modèles standard ne peuvent pas être supprimés.')

  // Families' uploaded documents live in the `documents` bucket and aren't
  // touched by the DB cascade on the template row — clean them up too, best
  // effort, same as the template PDF removal below.
  const { data: assignmentRows } = await supabase
    .from('assignments').select('id').eq('template_id', id)
  const assignmentIds = (assignmentRows ?? []).map((a: any) => a.id)
  if (assignmentIds.length > 0) {
    const { data: submissionRows } = await supabase
      .from('submissions').select('id').in('assignment_id', assignmentIds)
    const submissionIds = (submissionRows ?? []).map((s: any) => s.id)
    if (submissionIds.length > 0) {
      const { data: uploadRows } = await supabase
        .from('document_uploads').select('storage_path').in('submission_id', submissionIds)
      const paths = (uploadRows ?? []).map((u: any) => u.storage_path as string)
      for (let i = 0; i < paths.length; i += 100) {
        // Best effort — an orphaned file must not block the delete.
        await supabase.storage.from('documents').remove(paths.slice(i, i + 100))
      }
    }
  }

  if (tmpl.template_file_path) {
    // Best effort — an orphaned file must not block the delete.
    await supabase.storage.from('form-templates').remove([tmpl.template_file_path])
  }
  const { error } = await supabase.from('form_templates').delete().eq('id', id)
  if (error) throw error
  revalidatePath(tmpl.kind === 'doc' ? '/documents' : '/forms', 'layout')
}

const REMIND_COOLDOWN_MS = 24 * 3600 * 1000

// Shared by remindTemplate (24 h cooldown) and activateTemplate-in-phase-2
// (cooldownMs = 0: fresh assignments have never been emailed).
async function notifyIncompleteAssignees(
  supabase: SupabaseClient,
  tmpl: { id: string; name: string; deadline: string | null; exchange_id: string; school_id: string },
  exchangeName: string,
  cooldownMs: number,
): Promise<{ reminded: number; skipped: number; failed: number }> {
  const { data: rows } = await supabase
    .from('assignments')
    .select('id, last_reminded_at, submissions(status), users!student_id(email, full_name)')
    .eq('template_id', tmpl.id)
  const cutoff = Date.now() - cooldownMs
  let reminded = 0, skipped = 0, failed = 0
  const remindedIds: string[] = []
  for (const row of (rows ?? []) as any[]) {
    const submission = Array.isArray(row.submissions) ? row.submissions[0] : row.submissions
    const status = submission?.status ?? null
    if (status === 'submitted' || status === 'approved') continue
    if (cooldownMs > 0 && row.last_reminded_at && new Date(row.last_reminded_at).getTime() > cutoff) { skipped++; continue }
    const student = Array.isArray(row.users) ? row.users[0] : row.users
    if (!student?.email) { failed++; continue }
    const ok = await sendTemplateReminderEmail({
      to: student.email, studentName: student.full_name ?? '',
      templateName: tmpl.name, exchangeName, deadline: tmpl.deadline,
      ctx: { schoolId: tmpl.school_id, exchangeId: tmpl.exchange_id },
    })
    if (ok) { reminded++; remindedIds.push(row.id) } else { failed++ }
  }
  if (remindedIds.length > 0) {
    await supabase.from('assignments')
      .update({ last_reminded_at: new Date().toISOString() })
      .in('id', remindedIds)
  }
  return { reminded, skipped, failed }
}

export async function remindTemplate(id: string): Promise<{ reminded: number; skipped: number; failed: number }> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const tmpl = await getOwnedTemplate(supabase, id)
  await assertExchangeWritable(supabase, tmpl.exchange_id)
  if (tmpl.status !== 'active') throw new Error('Activez le modèle avant de relancer.')
  const { data: exchange } = await supabase
    .from('exchanges').select('name').eq('id', tmpl.exchange_id).single()
  return notifyIncompleteAssignees(supabase, tmpl, exchange?.name ?? '', REMIND_COOLDOWN_MS)
}

export async function getTemplateFileUrl(id: string): Promise<string> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const tmpl = await getOwnedTemplate(supabase, id)
  if (!tmpl.template_file_path) throw new Error('Aucun PDF pour ce modèle.')
  const { data, error } = await supabase.storage
    .from('form-templates')
    .createSignedUrl(tmpl.template_file_path, 3600)
  if (error || !data?.signedUrl) throw new Error('Impossible de générer le lien de téléchargement.')
  return data.signedUrl
}

export async function getTemplatesPage(exchangeId: string, family: 'forms' | 'docs'): Promise<{
  templates: TemplateVM[]
  studentCount: number
  enrolledStudents: { id: string; full_name: string }[]
  phase: 1 | 2
  exchangeName: string
}> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const schoolId = await assertOrganizer(supabase)

  const { data: exchange } = await supabase
    .from('exchanges').select('name, phase, school_a_id, school_b_id').eq('id', exchangeId).maybeSingle()
  if (!exchange || (exchange.school_a_id !== schoolId && exchange.school_b_id !== schoolId)) {
    throw new Error('Unauthorized')
  }

  const kinds: TemplateKind[] = family === 'forms' ? ['online', 'pdf'] : ['doc']
  const [{ data: templates }, { data: enrollments }] = await Promise.all([
    supabase
      .from('form_templates')
      .select('id, kind, status, audience, name, description, deadline, standard_key, condition_label, template_file_path, form_fields(label, "order")')
      .eq('exchange_id', exchangeId)
      .eq('school_id', schoolId)
      .in('kind', kinds)
      .order('created_at'),
    supabase.from('exchange_enrollments').select('user_id').eq('exchange_id', exchangeId),
  ])

  const enrolledIds = (enrollments ?? []).map((e: any) => e.user_id)
  const enrolledStudents: { id: string; full_name: string }[] = enrolledIds.length > 0
    ? ((await supabase
        .from('users').select('id, full_name')
        .in('id', enrolledIds).eq('school_id', schoolId).eq('role', 'student')
        .order('full_name')).data ?? [])
    : []
  const studentById = new Map(enrolledStudents.map(s => [s.id, s.full_name]))

  const templateIds = (templates ?? []).map((t: any) => t.id)
  const assignments: any[] = templateIds.length > 0
    ? ((await supabase
        .from('assignments')
        .select('id, template_id, student_id, submissions(status)')
        .in('template_id', templateIds)).data ?? [])
    : []

  const byTemplate = new Map<string, AssigneeRow[]>()
  for (const a of assignments) {
    const submission = Array.isArray(a.submissions) ? a.submissions[0] : a.submissions
    const row: AssigneeRow = {
      assignmentId: a.id, studentId: a.student_id,
      studentName: studentById.get(a.student_id) ?? '—',
      submissionStatus: submission?.status ?? null,
    }
    const list = byTemplate.get(a.template_id) ?? []
    list.push(row)
    byTemplate.set(a.template_id, list)
  }

  const vms: TemplateVM[] = (templates ?? []).map((t: any) => ({
    id: t.id, kind: t.kind, status: t.status, audience: t.audience,
    name: t.name, description: t.description, deadline: t.deadline,
    standard_key: t.standard_key, condition_label: t.condition_label,
    template_file_path: t.template_file_path,
    fields: [...(t.form_fields ?? [])].sort((a: any, b: any) => a.order - b.order).map((f: any) => f.label),
    assignees: (byTemplate.get(t.id) ?? []).sort((a, b) => a.studentName.localeCompare(b.studentName)),
  }))

  return {
    templates: vms,
    studentCount: enrolledStudents.length,
    enrolledStudents,
    phase: (exchange.phase ?? 1) as 1 | 2,
    exchangeName: exchange.name,
  }
}
