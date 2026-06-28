'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendRejectionEmail } from '@/lib/email'

// Verify the assignment belongs to the calling student. Throws if not.
async function assertStudentOwnsAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
  userId: string,
) {
  const { data: assignment } = await supabase
    .from('assignments')
    .select('id')
    .eq('id', assignmentId)
    .eq('student_id', userId)
    .maybeSingle()
  if (!assignment) throw new Error('Assignment not found')
}

// Verify the caller is an organizer for the school that owns the assignment's
// form template. Throws if not.
async function assertOrganizerOwnsAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
  userId: string,
) {
  const { data: ctx } = await supabase
    .from('assignments')
    .select('form_templates!inner(school_id)')
    .eq('id', assignmentId)
    .maybeSingle() as any
  if (!ctx) throw new Error('Assignment not found')

  const { data: profile } = await supabase
    .from('users')
    .select('school_id, role')
    .eq('id', userId)
    .single()
  if (profile?.role !== 'organizer' || profile.school_id !== ctx.form_templates.school_id) {
    throw new Error('Unauthorized')
  }
}

export async function getAssignmentDetails(assignmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
    .single() as any
  if (tErr) throw tErr

  const { data: submission } = await supabase
    .from('submissions')
    .select('*, field_answers(*), document_uploads(*)')
    .eq('assignment_id', assignmentId)
    .maybeSingle() as any

  return { assignment, template, submission }
}

export async function saveFormAnswers(
  assignmentId: string,
  answers: Record<string, string>,
  submit: boolean
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertStudentOwnsAssignment(supabase, assignmentId, user.id)

  // Ensure submission row exists (upsert via assignment)
  const { data: existing } = await supabase
    .from('submissions')
    .select('id')
    .eq('assignment_id', assignmentId)
    .maybeSingle()

  let submissionId: string
  if (existing) {
    submissionId = existing.id
    if (submit) {
      await supabase.from('submissions')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', submissionId)
    }
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertStudentOwnsAssignment(supabase, assignmentId, user.id)

  // Storage key must stay within this assignment/slot prefix (no traversal)
  if (!storagePath.startsWith(`${assignmentId}/${slotId}/`) || storagePath.includes('..')) {
    throw new Error('Invalid storage path')
  }

  // Ensure submission row exists
  const { data: existing } = await supabase
    .from('submissions')
    .select('id')
    .eq('assignment_id', assignmentId)
    .maybeSingle()

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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertOrganizerOwnsAssignment(supabase, assignmentId, user.id)

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
      .single() as any,
    supabase
      .from('users')
      .select('id, full_name, email')
      .eq('id', assignment.student_id)
      .single(),
    supabase
      .from('submissions')
      .select('*, field_answers(*), document_uploads(*)')
      .eq('assignment_id', assignmentId)
      .maybeSingle() as any,
  ])

  // Attach short-lived signed download URLs for any uploaded documents
  if (submission?.document_uploads?.length) {
    await Promise.all(
      submission.document_uploads.map(async (upload: any) => {
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

  return { assignment, template, student, submission }
}

export async function approveSubmission(assignmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertOrganizerOwnsAssignment(supabase, assignmentId, user.id)

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

  revalidatePath(`/exchanges`)
}

export async function rejectSubmission(assignmentId: string, note: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertOrganizerOwnsAssignment(supabase, assignmentId, user.id)

  const { data: submission } = await supabase
    .from('submissions')
    .select('id')
    .eq('assignment_id', assignmentId)
    .single()
  if (!submission) throw new Error('No submission found')

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

  // Notify the student immediately. Email failure must not roll back the rejection.
  const { data: info } = await supabase
    .from('assignments')
    .select('student:users!student_id(email, full_name), form_templates!inner(name)')
    .eq('id', assignmentId)
    .single() as any
  if (info?.student?.email) {
    await sendRejectionEmail({
      to: info.student.email,
      studentName: info.student.full_name ?? '',
      formName: info.form_templates.name,
      note,
      assignmentId,
    })
  }

  revalidatePath(`/exchanges`)
}

export async function submitDocumentAssignment(assignmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertStudentOwnsAssignment(supabase, assignmentId, user.id)

  const { data: existing } = await supabase
    .from('submissions')
    .select('id')
    .eq('assignment_id', assignmentId)
    .maybeSingle()

  if (!existing) throw new Error('No submission found — upload at least one document first')

  const { error } = await supabase
    .from('submissions')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', existing.id)
  if (error) throw error

  revalidatePath(`/my-forms/${assignmentId}`)
  revalidatePath('/my-forms')
}
