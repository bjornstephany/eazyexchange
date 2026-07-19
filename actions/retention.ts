// actions/retention.ts
// Organizer-facing data-retention actions (GDPR Art. 15/17). Erasure verifies
// school scope on the RLS session, THEN calls the service-role erase primitive
// and audits. Note: actions/retention.ts does NOT import the admin client — it
// delegates privileged deletes to lib/retention/erase.ts (allowlisted).
'use server'

import { revalidatePath } from 'next/cache'
import JSZip from 'jszip'
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/lib/auth/require'
import { eraseApplication, eraseStudent } from '@/lib/retention/erase'
import { signApplicationPhotoUrls } from '@/lib/application-photos'
import { logAudit } from '@/lib/audit'

export type SubjectRef =
  | { kind: 'student'; id: string }
  | { kind: 'application'; id: string }

export type ErasableSubject = {
  kind: 'student' | 'application'
  id: string
  name: string
  email: string
  status: string | null
}

export async function getErasableSubjects(): Promise<ErasableSubject[]> {
  await requireOrganizer()
  const supabase = await createClient()

  // RLS scopes both reads to the caller's school.
  const [{ data: students }, { data: apps }] = await Promise.all([
    supabase.from('users').select('id, full_name, email').eq('role', 'student').order('full_name'),
    supabase.from('applications').select('id, email, status, data').order('created_at', { ascending: false }),
  ])

  const out: ErasableSubject[] = []
  for (const s of students ?? []) {
    out.push({ kind: 'student', id: s.id, name: s.full_name ?? '', email: s.email ?? '', status: null })
  }
  for (const a of apps ?? []) {
    const d = (a.data ?? {}) as Record<string, string>
    const name = [d.first_name, d.last_name].filter(Boolean).join(' ')
    out.push({ kind: 'application', id: a.id, name, email: a.email ?? '', status: a.status })
  }
  return out
}

export async function eraseSubject(ref: SubjectRef): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requireOrganizer()
  const supabase = await createClient()

  if (ref.kind === 'student') {
    // Scope check: the student must be visible to the caller under RLS
    // (same school). RLS returns null for another school's row.
    const { data } = await supabase
      .from('users').select('id').eq('id', ref.id).eq('role', 'student').maybeSingle()
    if (!data) return { ok: false, error: 'not_found' }

    const summary = await eraseStudent(ref.id)
    await logAudit({
      action: 'subject.erased', actorUserId: profile.id, actorSchoolId: profile.school_id,
      targetType: 'user', targetId: ref.id, metadata: { ...summary },
    })
  } else {
    const { data } = await supabase
      .from('applications').select('id').eq('id', ref.id).maybeSingle()
    if (!data) return { ok: false, error: 'not_found' }

    const summary = await eraseApplication(ref.id)
    await logAudit({
      action: 'subject.erased', actorUserId: profile.id, actorSchoolId: profile.school_id,
      targetType: 'application', targetId: ref.id, metadata: { ...summary },
    })
  }

  revalidatePath('/settings')
  return { ok: true }
}

export type ExportResult =
  | { ok: true; filename: string; base64: string }
  | { ok: false; error: string }

// Build a portability package on the ORGANIZER'S RLS session (Art. 15/20). The
// only service-role touch is the application-photos signer (that bucket has no
// organizer storage policy); everything else — DB rows and documents-bucket
// files — is read as the organizer.
export async function exportSubject(ref: SubjectRef): Promise<ExportResult> {
  await requireOrganizer()
  const supabase = await createClient()
  const zip = new JSZip()

  if (ref.kind === 'application') {
    const { data: app } = await supabase
      .from('applications')
      .select('id, email, status, data, photo_path, exchange_id, created_at, submitted_at')
      .eq('id', ref.id).maybeSingle()
    if (!app) return { ok: false, error: 'not_found' }

    zip.file('data.json', JSON.stringify(app, null, 2))

    if (app.photo_path) {
      const signed = await signApplicationPhotoUrls([app.photo_path])
      const url = signed.get(app.photo_path)
      if (url) {
        const bytes = await (await fetch(url)).arrayBuffer()
        zip.file(`photo-${app.photo_path.split('/').pop()}`, bytes)
      }
    }
    return finishZip(zip, `export-application-${ref.id}`)
  }

  // Student: profile + every submission's field answers + document files.
  const { data: student } = await supabase
    .from('users').select('id, full_name, email').eq('id', ref.id).eq('role', 'student').maybeSingle()
  if (!student) return { ok: false, error: 'not_found' }

  const { data: assignments } = await supabase
    .from('assignments')
    .select('id, template_id, submissions(id, status, field_answers(field_id, value), document_uploads(storage_path, file_name))')
    .eq('student_id', ref.id)

  zip.file('data.json', JSON.stringify({ student, assignments: assignments ?? [] }, null, 2))

  // Document bytes via the organizer's own signed URLs (documents bucket allows
  // organizer SELECT by assignment school — see 20260625000001_storage_policies).
  // Supabase typegen models the nested embeds loosely; narrow via unknown.
  type ExportAssignment = { submissions?: { document_uploads?: { storage_path: string }[] }[] | null }
  for (const a of (assignments ?? []) as unknown as ExportAssignment[]) {
    for (const sub of a.submissions ?? []) {
      for (const doc of sub.document_uploads ?? []) {
        const { data: signed } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 300)
        if (signed?.signedUrl) {
          const bytes = await (await fetch(signed.signedUrl)).arrayBuffer()
          zip.file(`documents/${doc.storage_path.split('/').pop()}`, bytes)
        }
      }
    }
  }
  return finishZip(zip, `export-student-${ref.id}`)
}

async function finishZip(zip: JSZip, base: string): Promise<ExportResult> {
  const buf = await zip.generateAsync({ type: 'nodebuffer' })
  return { ok: true, filename: `${base}.zip`, base64: buf.toString('base64') }
}
