'use server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendRejectionEmail } from '@/lib/email'
import { hasOverlongAnswer, hasMissingRequired, MAX_ANSWER_LENGTH } from '@/lib/validation'
import { assertExchangeWritable } from '@/lib/exchange-guard'
import { logAudit } from '@/lib/audit'
import type { FormTemplate, FormField, DocumentSlot, Submission, FieldAnswer, DocumentUpload } from '@/types/db'

// Verify the assignment belongs to the calling student. Throws if not.
// Returns the assignment's exchange id (via its template) for the write guard.
async function assertStudentOwnsAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
  userId: string,
): Promise<{ exchangeId: string }> {
  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, form_templates!inner(exchange_id)')
    .eq('id', assignmentId)
    .eq('student_id', userId)
    .maybeSingle<{ id: string; form_templates: { exchange_id: string } }>()
  if (!assignment) throw new Error('Assignment not found')
  return { exchangeId: assignment.form_templates.exchange_id }
}

// Verify the caller is an organizer for the school that owns the assignment's
// form template. Throws if not. Returns the assignment's exchange id.
async function assertOrganizerOwnsAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
): Promise<{ exchangeId: string; schoolId: string }> {
  const { data: ctx } = await supabase
    .from('assignments')
    .select('form_templates!inner(school_id, exchange_id)')
    .eq('id', assignmentId)
    .maybeSingle<{ form_templates: { school_id: string; exchange_id: string } }>()
  if (!ctx) throw new Error('Assignment not found')

  const profile = await getProfile()
  if (profile?.role !== 'organizer' || profile.school_id !== ctx.form_templates.school_id) {
    throw new Error('Unauthorized')
  }
  return {
    exchangeId: ctx.form_templates.exchange_id,
    schoolId: ctx.form_templates.school_id,
  }
}

export async function getAssignmentDetails(assignmentId: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: assignment, error: aErr } = await supabase
    .from('assignments')
    .select('id, student_id, template_id')
    .eq('id', assignmentId)
    .eq('student_id', user.id)
    .single()
  if (aErr || !assignment) throw new Error('Assignment not found')

  const { data: template, error: tErr } = await supabase
    .from('form_templates')
    .select('*, form_fields(*), document_slots(*)')
    .eq('id', assignment.template_id)
    .order('order', { referencedTable: 'form_fields', ascending: true })
    .order('order', { referencedTable: 'document_slots', ascending: true })
    .single<FormTemplate & { form_fields: FormField[]; document_slots: DocumentSlot[] }>()
  if (tErr) throw tErr

  const { data: submission } = await supabase
    .from('submissions')
    .select('*, field_answers(*), document_uploads(*)')
    .eq('assignment_id', assignmentId)
    .maybeSingle<Submission & { field_answers: FieldAnswer[]; document_uploads: DocumentUpload[] }>()

  return { assignment, template, submission }
}

export async function saveFormAnswers(
  assignmentId: string,
  answers: Record<string, string>,
  submit: boolean
) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const { exchangeId } = await assertStudentOwnsAssignment(supabase, assignmentId, user.id)
  await assertExchangeWritable(supabase, exchangeId)

  // L5: cap answer length (storage-abuse guard) and, on submit, enforce required
  // fields server-side — the form inputs' `required` attribute isn't enforced on
  // the client (the submit button isn't a native form submit).
  if (hasOverlongAnswer(answers)) {
    throw new Error(`An answer exceeds the ${MAX_ANSWER_LENGTH}-character limit.`)
  }
  if (submit) {
    // Fail closed: if we can't read the template, we can't verify required
    // fields, so refuse rather than letting an unvalidated submission through.
    const { data: assignmentRow, error: assignmentErr } = await supabase
      .from('assignments').select('template_id').eq('id', assignmentId).single()
    if (assignmentErr || !assignmentRow) {
      throw new Error('Could not verify the form before submitting — please try again.')
    }
    const { data: requiredFields } = await supabase
      .from('form_fields')
      .select('id, field_type')
      .eq('template_id', assignmentRow.template_id)
      .eq('required', true)
    if (hasMissingRequired(requiredFields ?? [], answers)) {
      throw new Error('Please complete all required fields before submitting.')
    }
  }

  // Ensure submission row exists (upsert via assignment)
  const { data: existing } = await supabase
    .from('submissions')
    .select('id, status')
    .eq('assignment_id', assignmentId)
    .maybeSingle()

  // An approved submission is locked: re-saving would overwrite the reviewed
  // answers and revert status while keeping the stale review trail.
  if (existing && existing.status === 'approved') {
    throw new Error('This form has already been approved and can no longer be edited.')
  }

  let submissionId: string
  if (existing) {
    submissionId = existing.id
  } else {
    const { data: created, error } = await supabase
      .from('submissions')
      .insert({
        assignment_id: assignmentId,
        status: submit ? 'submitted' : 'draft',
        submitted_at: submit ? new Date().toISOString() : null,
        reviewed_at: null,
        reviewer_id: null,
        review_note: null,
      })
      .select('id')
      .single()
    if (error) throw error
    submissionId = created.id
  }

  // Upsert answers
  const answerRows = Object.entries(answers).map(([field_id, value]) => ({
    submission_id: submissionId,
    field_id,
    value,
  }))
  if (answerRows.length > 0) {
    const { error } = await supabase
      .from('field_answers')
      .upsert(answerRows, { onConflict: 'submission_id,field_id' })
    if (error) throw error
  }

  if (submit && existing) {
    await supabase.from('submissions')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', submissionId)
  }

  revalidatePath(`/my-forms/${assignmentId}`)
  revalidatePath('/my-forms')
  return submissionId
}

export async function recordDocumentUpload(
  assignmentId: string,
  slotId: string,
  storagePath: string,
  fileName: string,
) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const { exchangeId } = await assertStudentOwnsAssignment(supabase, assignmentId, user.id)
  await assertExchangeWritable(supabase, exchangeId)

  // Storage key must stay within this assignment/slot prefix (no traversal).
  // Match only a real `..` path segment so legitimate filenames that merely
  // contain consecutive dots (e.g. "scan..final.pdf") aren't rejected.
  if (!storagePath.startsWith(`${assignmentId}/${slotId}/`) || /(^|\/)\.\.(\/|$)/.test(storagePath)) {
    throw new Error('Invalid storage path')
  }

  // Ensure submission row exists
  const { data: existing } = await supabase
    .from('submissions')
    .select('id, status')
    .eq('assignment_id', assignmentId)
    .maybeSingle()

  if (existing && existing.status === 'approved') {
    throw new Error('This form has already been approved and can no longer be edited.')
  }

  let submissionId: string
  if (existing) {
    submissionId = existing.id
  } else {
    const { data: created, error } = await supabase
      .from('submissions')
      .insert({
        assignment_id: assignmentId,
        status: 'draft',
        submitted_at: null,
        reviewed_at: null,
        reviewer_id: null,
        review_note: null,
      })
      .select('id')
      .single()
    if (error) throw error
    submissionId = created.id
  }

  const { error } = await supabase.from('document_uploads').upsert(
    {
      submission_id: submissionId,
      slot_id: slotId,
      storage_path: storagePath,
      file_name: fileName,
    },
    { onConflict: 'submission_id,slot_id' },
  )
  if (error) throw error

  revalidatePath(`/my-forms/${assignmentId}`)
}

export async function getSubmissionForReview(assignmentId: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  await assertOrganizerOwnsAssignment(supabase, assignmentId)

  const { data: assignment, error: aErr } = await supabase
    .from('assignments')
    .select('id, student_id, template_id')
    .eq('id', assignmentId)
    .single()
  if (aErr || !assignment) throw new Error('Assignment not found')

  const [{ data: template }, { data: student }, { data: submission }] = await Promise.all([
    supabase
      .from('form_templates')
      .select('*, form_fields(*), document_slots(*)')
      .eq('id', assignment.template_id)
      .order('order', { referencedTable: 'form_fields', ascending: true })
      .order('order', { referencedTable: 'document_slots', ascending: true })
      .single<FormTemplate & { form_fields: FormField[]; document_slots: DocumentSlot[] }>(),
    supabase
      .from('users')
      .select('id, full_name, email')
      .eq('id', assignment.student_id)
      .single(),
    supabase
      .from('submissions')
      .select('*, field_answers(*), document_uploads(*)')
      .eq('assignment_id', assignmentId)
      .maybeSingle<Submission & {
        field_answers: FieldAnswer[]
        document_uploads: (DocumentUpload & { signed_url?: string | null })[]
      }>(),
  ])

  // Attach short-lived signed download URLs for any uploaded documents
  if (submission?.document_uploads?.length) {
    await Promise.all(
      submission.document_uploads.map(async (upload) => {
        const { data } = await supabase.storage
          .from('documents')
          // download: true sets content-disposition=attachment so a crafted
          // file can't render inline in the organizer's browser (defense in
          // depth alongside the bucket's MIME allowlist — see lib/uploads.ts).
          .createSignedUrl(upload.storage_path, 3600, { download: true })
        upload.signed_url = data?.signedUrl ?? null
      })
    )
  }

  // template is guaranteed by the assignments.template_id FK — assignment
  // lookup above already succeeded, so the referenced template row exists.
  return { assignment, template: template!, student, submission }
}

export async function approveSubmission(assignmentId: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const { exchangeId, schoolId } = await assertOrganizerOwnsAssignment(supabase, assignmentId)
  await assertExchangeWritable(supabase, exchangeId)

  const { data: submission } = await supabase
    .from('submissions')
    .select('id')
    .eq('assignment_id', assignmentId)
    .single()
  if (!submission) throw new Error('No submission found')

  const { error } = await supabase
    .from('submissions')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewer_id: user.id })
    .eq('id', submission.id)
  if (error) throw error

  await logAudit({
    action: 'submission.approved',
    actorUserId: user.id,
    actorSchoolId: schoolId,
    targetType: 'submission',
    targetId: submission.id,
    metadata: { assignment_id: assignmentId },
  })

  revalidatePath(`/exchanges`)
}

export async function rejectSubmission(assignmentId: string, note: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const { exchangeId, schoolId } = await assertOrganizerOwnsAssignment(supabase, assignmentId)
  await assertExchangeWritable(supabase, exchangeId)

  const { data: submission } = await supabase
    .from('submissions')
    .select('id, status')
    .eq('assignment_id', assignmentId)
    .single()
  if (!submission) throw new Error('No submission found')
  // Only a submitted (or previously approved) submission can be rejected — never
  // a draft the student hasn't submitted, which would email them out of the blue.
  if (submission.status === 'draft') {
    throw new Error('This form has not been submitted yet and cannot be rejected.')
  }

  const { error } = await supabase
    .from('submissions')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewer_id: user.id,
      review_note: note,
    })
    .eq('id', submission.id)
  if (error) throw error

  await logAudit({
    action: 'submission.rejected',
    actorUserId: user.id,
    actorSchoolId: schoolId,
    targetType: 'submission',
    targetId: submission.id,
    metadata: { assignment_id: assignmentId }, // never the note text
  })

  // Notify the student immediately. Email failure must not roll back the rejection.
  const { data: info } = await supabase
    .from('assignments')
    .select('student:users!student_id(email, full_name), form_templates!inner(name)')
    .eq('id', assignmentId)
    .single<{
      student: { email: string | null; full_name: string | null } | null
      form_templates: { name: string }
    }>()
  if (info?.student?.email) {
    await sendRejectionEmail({
      to: info.student.email,
      studentName: info.student.full_name ?? '',
      formName: info.form_templates.name,
      note,
      assignmentId,
      ctx: { schoolId, exchangeId },
    })
  }

  revalidatePath(`/exchanges`)
}

export async function submitDocumentAssignment(assignmentId: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const { exchangeId } = await assertStudentOwnsAssignment(supabase, assignmentId, user.id)
  await assertExchangeWritable(supabase, exchangeId)

  const { data: existing } = await supabase
    .from('submissions')
    .select('id, status')
    .eq('assignment_id', assignmentId)
    .maybeSingle()

  if (!existing) throw new Error('No submission found — upload at least one document first')
  if (existing.status === 'approved') {
    throw new Error('This form has already been approved and can no longer be edited.')
  }

  const { error } = await supabase
    .from('submissions')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', existing.id)
  if (error) throw error

  revalidatePath(`/my-forms/${assignmentId}`)
  revalidatePath('/my-forms')
}
