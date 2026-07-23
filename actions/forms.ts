'use server'
import { createClient } from '@/lib/supabase/server'
import { requireUser, requireOrganizer } from '@/lib/auth/require'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FieldType, FormTemplate, FormField, DocumentSlot } from '@/types/db'
import type { TemplateVM, AssigneeRow, TemplateKind } from '@/lib/forms/rollup'
import { sendTemplateReminderEmail } from '@/lib/email'
import { assertExchangeWritable } from '@/lib/exchange-guard'
import type { TemplateActionResult, CreateTemplateResult } from '@/lib/forms/template-result'
import { MSG_DEADLINE_REQUIRED } from '@/lib/forms/template-result'
import { STANDARD_TEMPLATES } from '@/lib/forms/standard-library'
import { insertStandardTemplate } from '@/lib/forms/insert-standard-template'
import { activateTemplateRecord } from '@/lib/forms/activate'
import { mergeProgramDetails, type ProgramDetailPatch } from '@/lib/forms/add-requirements'
import { travelOrderProblem } from '@/lib/exchange/travel-dates'
import { resolveVariables, type ResolvedVariables } from '@/lib/forms/fillable/render'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'

// Throw unless the caller is an organizer. Returns the organizer's school_id.
async function assertOrganizer(): Promise<string> {
  const { profile } = await requireOrganizer()
  return profile.school_id as string
}

// Throw unless the caller is an organizer for the school that owns the template.
async function assertOrganizerOwnsTemplate(
  supabase: SupabaseClient, templateId: string,
): Promise<{ exchangeId: string }> {
  const schoolId = await assertOrganizer()
  const { data: tmpl } = await supabase
    .from('form_templates').select('school_id, exchange_id').eq('id', templateId).maybeSingle()
  if (!tmpl || tmpl.school_id !== schoolId) throw new Error('Unauthorized')
  return { exchangeId: tmpl.exchange_id as string }
}

export async function getTemplate(id: string) {
  const supabase = await createClient()
  await requireUser()
  await assertOrganizerOwnsTemplate(supabase, id)

  const { data, error } = await supabase
    .from('form_templates')
    .select('*, form_fields(*), document_slots(*)')
    .eq('id', id)
    .order('order', { referencedTable: 'form_fields', ascending: true })
    .order('order', { referencedTable: 'document_slots', ascending: true })
    .single<FormTemplate & { form_fields: FormField[]; document_slots: DocumentSlot[] }>()
  if (error) throw error
  return data
}

export async function addField(templateId: string, label: string, fieldType: FieldType, required: boolean, options?: string[]) {
  const supabase = await createClient()
  await requireUser()
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

  // Saving the first question is what publishes a custom online form — there
  // is no Activate button any more. The gate still runs, so a form without a
  // deadline simply stays draft.
  const tmpl = await getOwnedTemplate(supabase, templateId)
  if (tmpl.status === 'draft') {
    const activated = await activateTemplateRecord(supabase, tmpl)
    if (activated.ok) revalidatePath('/dashboard')
  }

  // FormBuilder only renders for kind !== 'doc' templates, which live under
  // /forms/[templateId] (not the legacy /exchanges/[id]/forms/* route these
  // used to point at) — without this the editor's own page never refreshes.
  revalidatePath('/forms', 'layout')
}

export async function removeField(fieldId: string) {
  const supabase = await createClient()
  await requireUser()
  const { data: field } = await supabase
    .from('form_fields').select('template_id').eq('id', fieldId).maybeSingle()
  if (!field) throw new Error('Field not found')
  const { exchangeId } = await assertOrganizerOwnsTemplate(supabase, field.template_id)
  await assertExchangeWritable(supabase, exchangeId)

  const { error } = await supabase.from('form_fields').delete().eq('id', fieldId)
  if (error) throw error
  revalidatePath('/forms', 'layout')
}

// Fetch a template the caller's school owns (with fields), or throw.
async function getOwnedTemplate(supabase: SupabaseClient, templateId: string) {
  const schoolId = await assertOrganizer()
  const { data: tmpl } = await supabase
    .from('form_templates')
    .select('id, exchange_id, school_id, name, kind, status, audience, deadline, standard_key, condition_label, template_file_path, form_fields(id)')
    .eq('id', templateId)
    .maybeSingle()
  if (!tmpl || tmpl.school_id !== schoolId) throw new Error('Unauthorized')
  return tmpl
}

const PDF_MAX_BYTES = 10 * 1024 * 1024

// Expected validation outcome — returned, never thrown (prod redacts throws).
function pdfProblem(file: File): string | null {
  if (file.type !== 'application/pdf') return 'Le fichier doit être un PDF.'
  if (file.size > PDF_MAX_BYTES) return 'Le PDF dépasse 10 Mo.'
  return null
}

async function uploadTemplatePdf(
  supabase: SupabaseClient, schoolId: string, templateId: string, file: File,
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  const problem = pdfProblem(file)
  if (problem) return { ok: false, message: problem }
  const path = `${schoolId}/${templateId}.pdf`
  const { error } = await supabase.storage
    .from('form-templates')
    .upload(path, file, { upsert: true, contentType: 'application/pdf' })
  // Bucket-side size/MIME rejections are expected outcomes, not crashes.
  if (error) return { ok: false, message: 'Le téléversement du PDF a échoué. Réessayez.' }
  return { ok: true, path }
}

export async function createDraftTemplate(formData: FormData): Promise<CreateTemplateResult> {
  const supabase = await createClient()
  const user = await requireUser()
  const schoolId = await assertOrganizer()

  const exchangeId = formData.get('exchange_id') as string
  await assertExchangeWritable(supabase, exchangeId)
  const kind = formData.get('kind') as TemplateKind
  const name = ((formData.get('name') as string) ?? '').trim()
  const deadline = ((formData.get('deadline') as string) ?? '').trim()
  const audience = (formData.get('audience') as string) === 'conditional' ? 'conditional' : 'all'
  const conditionLabel = ((formData.get('condition_label') as string) ?? '').trim() || null
  const file = formData.get('file') as File | null

  if (!['online', 'pdf', 'doc'].includes(kind)) return { ok: false, message: 'Type de modèle invalide.' }
  if (!name) return { ok: false, message: 'Donnez un nom au modèle.' }
  if (!deadline) return { ok: false, message: MSG_DEADLINE_REQUIRED }
  if (audience === 'conditional' && kind !== 'doc') return { ok: false, message: 'Seules les pièces peuvent être conditionnelles.' }
  if (kind === 'pdf') {
    if (!file || file.size === 0) return { ok: false, message: 'Téléversez le PDF à faire signer.' }
    const problem = pdfProblem(file)
    if (problem) return { ok: false, message: problem }
  }

  // Conditional documents pick their audience here so they activate on add
  // like everything else. Malformed JSON is treated as « no selection ».
  let studentIds: string[] = []
  if (audience === 'conditional') {
    const raw = (formData.get('student_ids') as string) ?? '[]'
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) studentIds = parsed.filter((x): x is string => typeof x === 'string')
    } catch {
      studentIds = []
    }
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
      const uploaded = await uploadTemplatePdf(supabase, schoolId, templateId, file)
      if (!uploaded.ok) {
        // Don't leave a half-configured draft behind.
        await supabase.from('form_templates').delete().eq('id', templateId)
        return { ok: false, message: uploaded.message }
      }
      const { error: pathError } = await supabase
        .from('form_templates').update({ template_file_path: uploaded.path }).eq('id', templateId)
      if (pathError) throw pathError
    }
  } catch (err) {
    // Don't leave a half-configured draft behind.
    await supabase.from('form_templates').delete().eq('id', templateId)
    throw err
  }

  // An online form is the only template that can legitimately stay draft: its
  // questions cannot be authored in a compact add prompt. addField publishes
  // it the moment the first one is saved.
  if (kind === 'online') {
    revalidatePath('/forms', 'layout')
    return { ok: true, id: templateId }
  }

  const tmpl = await getOwnedTemplate(supabase, templateId)
  const activated = await activateTemplateRecord(supabase, tmpl, audience === 'conditional' ? studentIds : undefined)
  if (!activated.ok) {
    revalidatePath('/forms', 'layout')
    return { ok: false, message: activated.message }
  }

  revalidatePath('/forms', 'layout')
  revalidatePath('/dashboard')
  return { ok: true, id: templateId }
}

// Add one standard-library template to an exchange and publish it in the same
// request. The library drawer's inline « Ajouter » collects the deadline and
// whatever program details the entry still needs, so the activation gate can
// no longer fail here — but it still runs, so a UI bug degrades to a draft
// rather than to a half-configured template sent to families.
// Duplicate adds (unique index on (exchange_id, standard_key)) and a failing
// gate are expected outcomes → structured messages.
export async function addStandardTemplate(
  exchangeId: string,
  standardKey: string,
  input: { deadline: string; details?: ProgramDetailPatch },
): Promise<CreateTemplateResult> {
  const supabase = await createClient()
  const user = await requireUser()
  const schoolId = await assertOrganizer()
  await assertExchangeWritable(supabase, exchangeId)

  const std = STANDARD_TEMPLATES.find((s) => s.key === standardKey)
  if (!std) return { ok: false, message: 'Modèle standard inconnu.' }

  const deadline = (input.deadline ?? '').trim()
  if (!deadline) return { ok: false, message: MSG_DEADLINE_REQUIRED }

  // Detail answers are per exchange, so they land on the shared row before the
  // gate reads it — a later fillable form then asks for less or nothing.
  if (input.details && Object.keys(input.details).length > 0) {
    const { data: existing } = await supabase
      .from('exchange_program_details').select('*')
      .eq('exchange_id', exchangeId).maybeSingle<ProgramDetailsValues>()
    const merged = mergeProgramDetails(existing ?? null, input.details)
    // Check the merged pair, not the patch: the drawer only prompts for the
    // detail keys still missing, so a lone retour has to be compared against
    // the départ already on file.
    const orderProblem = travelOrderProblem(merged.travel_start, merged.travel_end)
    if (orderProblem) return { ok: false, message: orderProblem }
    const { error: detailsError } = await supabase.from('exchange_program_details').upsert({
      exchange_id: exchangeId, ...merged, updated_at: new Date().toISOString(),
    }, { onConflict: 'exchange_id' })
    if (detailsError) throw detailsError
  }

  const res = await insertStandardTemplate(supabase, std, { exchangeId, schoolId, userId: user.id, deadline })
  if ('duplicate' in res) return { ok: false, message: 'Ce modèle est déjà ajouté à cet échange.' }

  const tmpl = await getOwnedTemplate(supabase, res.id)
  const activated = await activateTemplateRecord(supabase, tmpl)
  if (!activated.ok) {
    // Keep the draft — the organizer can finish it from Modifier rather than
    // lose the row (and, for the AST, the uploaded PDF).
    revalidatePath('/forms', 'layout')
    return { ok: false, message: activated.message }
  }

  revalidatePath('/forms', 'layout')
  revalidatePath('/dashboard')
  return { ok: true, id: res.id }
}

export async function updateTemplateMeta(
  id: string,
  meta: {
    name: string
    description: string | null
    deadline: string | null
    condition_label: string | null
    external_url: string | null
  },
): Promise<TemplateActionResult> {
  const supabase = await createClient()
  await requireUser()
  const tmpl = await getOwnedTemplate(supabase, id)
  await assertExchangeWritable(supabase, tmpl.exchange_id)

  const name = meta.name.trim()
  if (!name) return { ok: false, message: 'Le nom ne peut pas être vide.' }
  if (tmpl.status === 'active' && !meta.deadline) return { ok: false, message: 'Un modèle actif doit garder une date limite.' }
  const externalUrl = meta.external_url?.trim() || null
  if (externalUrl && (!externalUrl.startsWith('https://') || externalUrl.length > 500)) {
    return { ok: false, message: 'Le lien externe doit être une URL https:// (500 caractères max).' }
  }

  const { error } = await supabase.from('form_templates').update({
    name,
    description: meta.description?.trim() || null,
    deadline: meta.deadline || null,
    condition_label: tmpl.audience === 'conditional' ? (meta.condition_label?.trim() || null) : null,
    external_url: externalUrl,
  }).eq('id', id)
  if (error) throw error

  // A legacy draft whose only missing piece was the deadline can be rescued
  // right here — re-run the gate against the freshly-saved row. Restricted to
  // 'all': for 'conditional', activation is what creates the assignment rows,
  // and this edit path has no student picker to supply them, so auto-firing
  // it here would publish to an empty, permanently unfillable audience. If
  // the gate still refuses (something else is missing), fail soft — the meta
  // save itself has already succeeded and stays draft, same as today.
  if (tmpl.status === 'draft' && tmpl.audience === 'all') {
    await activateTemplateRecord(supabase, await getOwnedTemplate(supabase, id))
  }

  revalidatePath('/forms', 'layout')
  // Name/deadline also feed the dashboard grid once the template is active.
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function replaceTemplateFile(formData: FormData): Promise<TemplateActionResult> {
  const supabase = await createClient()
  await requireUser()
  const id = formData.get('template_id') as string
  const file = formData.get('file') as File | null
  const tmpl = await getOwnedTemplate(supabase, id)
  await assertExchangeWritable(supabase, tmpl.exchange_id)
  if (tmpl.kind !== 'pdf') return { ok: false, message: 'Ce modèle n’a pas de PDF.' }
  if (!file || file.size === 0) return { ok: false, message: 'Choisissez un fichier PDF.' }

  const uploaded = await uploadTemplatePdf(supabase, tmpl.school_id, id, file)
  if (!uploaded.ok) return { ok: false, message: uploaded.message }
  const { error } = await supabase.from('form_templates').update({ template_file_path: uploaded.path }).eq('id', id)
  if (error) throw error

  // Same rescue as updateTemplateMeta: a 'pdf' draft that was only missing
  // its file can now activate. 'all' only — fail soft on a gate refusal, the
  // upload itself has already succeeded.
  if (tmpl.status === 'draft' && tmpl.audience === 'all') {
    const activated = await activateTemplateRecord(supabase, await getOwnedTemplate(supabase, id))
    if (activated.ok) revalidatePath('/dashboard')
  }

  revalidatePath('/forms', 'layout')
  return { ok: true }
}

export async function deleteTemplate(id: string): Promise<void> {
  const supabase = await createClient()
  await requireUser()
  const tmpl = await getOwnedTemplate(supabase, id)
  await assertExchangeWritable(supabase, tmpl.exchange_id)

  // Families' uploaded documents live in the `documents` bucket and aren't
  // touched by the DB cascade on the template row — clean them up too, best
  // effort, same as the template PDF removal below.
  const { data: assignmentRows } = await supabase
    .from('assignments').select('id').eq('template_id', id)
  const assignmentIds = (assignmentRows ?? []).map((a) => a.id)
  if (assignmentIds.length > 0) {
    const { data: submissionRows } = await supabase
      .from('submissions').select('id').in('assignment_id', assignmentIds)
    const submissionIds = (submissionRows ?? []).map((s) => s.id)
    if (submissionIds.length > 0) {
      const { data: uploadRows } = await supabase
        .from('document_uploads').select('storage_path').in('submission_id', submissionIds)
      const paths = (uploadRows ?? []).map((u) => u.storage_path)
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
  revalidatePath('/forms', 'layout')
  // If it was active, it drops off the dashboard grid.
  revalidatePath('/dashboard')
}

const REMIND_COOLDOWN_MS = 24 * 3600 * 1000

// Emails incomplete assignees of a template (24 h cooldown). Used by remindTemplate.
async function notifyIncompleteAssignees(
  supabase: SupabaseClient,
  tmpl: { id: string; name: string; deadline: string | null; exchange_id: string; school_id: string },
  exchangeName: string,
): Promise<{ reminded: number; skipped: number; failed: number }> {
  const { data: rows } = await supabase
    .from('assignments')
    .select('id, last_reminded_at, submissions(status), users!student_id(email, full_name)')
    .eq('template_id', tmpl.id)
  const cutoff = Date.now() - REMIND_COOLDOWN_MS
  let reminded = 0, skipped = 0, failed = 0
  const remindedIds: string[] = []
  for (const row of rows ?? []) {
    const submission = Array.isArray(row.submissions) ? row.submissions[0] : row.submissions
    const status = submission?.status ?? null
    if (status === 'submitted' || status === 'approved') continue
    if (row.last_reminded_at && new Date(row.last_reminded_at).getTime() > cutoff) { skipped++; continue }
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
  await requireUser()
  const tmpl = await getOwnedTemplate(supabase, id)
  await assertExchangeWritable(supabase, tmpl.exchange_id)
  if (tmpl.status !== 'active') throw new Error('Activez le modèle avant de relancer.')
  const { data: exchange } = await supabase
    .from('exchanges').select('name').eq('id', tmpl.exchange_id).single()
  return notifyIncompleteAssignees(supabase, tmpl, exchange?.name ?? '')
}

export async function getTemplateFileUrl(id: string): Promise<string> {
  const supabase = await createClient()
  await requireUser()
  const tmpl = await getOwnedTemplate(supabase, id)
  if (!tmpl.template_file_path) throw new Error('Aucun PDF pour ce modèle.')
  const { data, error } = await supabase.storage
    .from('form-templates')
    .createSignedUrl(tmpl.template_file_path, 3600)
  if (error || !data?.signedUrl) throw new Error('Impossible de générer le lien de téléchargement.')
  return data.signedUrl
}

export async function getTemplatesPage(exchangeId: string): Promise<{
  templates: TemplateVM[]
  studentCount: number
  enrolledStudents: { id: string; full_name: string }[]
  exchangeName: string
  programDetails: ProgramDetailsValues | null
  resolvedVars: ResolvedVariables
}> {
  const supabase = await createClient()
  await requireUser()
  const schoolId = await assertOrganizer()

  const { data: exchange } = await supabase
    .from('exchanges').select('name, school_a_id, school_b_id').eq('id', exchangeId).maybeSingle()
  if (!exchange || (exchange.school_a_id !== schoolId && exchange.school_b_id !== schoolId)) {
    throw new Error('Unauthorized')
  }

  const [{ data: templates }, { data: enrollments }, { data: programDetails }] = await Promise.all([
    supabase
      .from('form_templates')
      .select('id, kind, status, audience, name, description, deadline, standard_key, condition_label, template_file_path, external_url, form_fields(label, "order")')
      .eq('exchange_id', exchangeId)
      .eq('school_id', schoolId)
      .order('created_at'),
    supabase.from('exchange_enrollments').select('user_id').eq('exchange_id', exchangeId),
    supabase.from('exchange_program_details').select('*')
      .eq('exchange_id', exchangeId).maybeSingle<ProgramDetailsValues>(),
  ])

  const enrolledIds = (enrollments ?? []).map((e) => e.user_id)
  const enrolledStudents: { id: string; full_name: string }[] = enrolledIds.length > 0
    ? ((await supabase
        .from('users').select('id, full_name')
        .in('id', enrolledIds).eq('school_id', schoolId).eq('role', 'student')
        .order('full_name')).data ?? [])
    : []
  const studentById = new Map(enrolledStudents.map(s => [s.id, s.full_name]))

  const templateIds = (templates ?? []).map((t) => t.id)
  const assignments = templateIds.length > 0
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

  const vms: TemplateVM[] = (templates ?? []).map((t) => ({
    id: t.id, kind: t.kind, status: t.status, audience: t.audience,
    name: t.name, description: t.description, deadline: t.deadline,
    standard_key: t.standard_key, condition_label: t.condition_label,
    template_file_path: t.template_file_path,
    external_url: t.external_url,
    fields: [...(t.form_fields ?? [])].sort((a, b) => a.order - b.order).map((f) => f.label),
    assignees: (byTemplate.get(t.id) ?? []).sort((a, b) => a.studentName.localeCompare(b.studentName)),
  }))

  return {
    templates: vms,
    studentCount: enrolledStudents.length,
    enrolledStudents,
    exchangeName: exchange.name,
    programDetails: programDetails ?? null,
    resolvedVars: resolveVariables({ exchangeName: exchange.name, details: programDetails ?? null }),
  }
}
