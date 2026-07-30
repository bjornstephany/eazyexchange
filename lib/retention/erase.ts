// lib/retention/erase.ts
// Service-role subject-erasure primitive (GDPR Art. 17). ON THE ADMIN ALLOWLIST.
//
// INVARIANT (load-bearing): delete storage objects BEFORE DB rows. Deleting a
// storage.objects row via SQL does not remove the S3 bytes — only the Storage
// API does — and once the DB rows are gone the paths are lost. This ordering is
// the single place the orphan-file bug can exist; it is unit-tested (erase.test.ts).
//
// Every function returns a PII-free summary (ids + counts only) for the caller
// to write to audit_log.

import { createAdminClient } from '@/lib/supabase/admin'
import { withAuthAdminRetry } from '@/lib/supabase/admin-retry'
import { APPLICATION_PHOTO_BUCKET } from '@/lib/uploads'

const DOCUMENTS_BUCKET = 'documents'

export type EraseApplicationResult = { applicationId: string; photosDeleted: number }
export type EraseStudentResult = {
  userId: string
  documentsDeleted: number
  photosDeleted: number
  applicationsDeleted: number
}
export type PurgeDocumentsResult = { exchangeId: string; documentsDeleted: number }

export async function eraseApplication(applicationId: string): Promise<EraseApplicationResult> {
  const admin = createAdminClient()

  // 1. Gather the storage path before deleting the row.
  const { data: app } = await admin
    .from('applications').select('photo_path').eq('id', applicationId).maybeSingle()

  // 2. Storage first.
  let photosDeleted = 0
  if (app?.photo_path) {
    await admin.storage.from(APPLICATION_PHOTO_BUCKET).remove([app.photo_path])
    photosDeleted = 1
  }

  // 3. DB row (no child FKs reference applications.id).
  await admin.from('applications').delete().eq('id', applicationId)

  return { applicationId, photosDeleted }
}

export async function eraseStudent(userId: string): Promise<EraseStudentResult> {
  const admin = createAdminClient()

  // 1. Gather EVERY storage path this student owns before any delete.
  const { data: assignments } = await admin.from('assignments').select('id').eq('student_id', userId)
  const assignmentIds = (assignments ?? []).map(a => a.id)

  let docPaths: string[] = []
  if (assignmentIds.length > 0) {
    const { data: subs } = await admin.from('submissions').select('id').in('assignment_id', assignmentIds)
    const submissionIds = (subs ?? []).map(s => s.id)
    if (submissionIds.length > 0) {
      const { data: uploads } = await admin
        .from('document_uploads').select('storage_path').in('submission_id', submissionIds)
      docPaths = (uploads ?? []).map(u => u.storage_path)
    }
  }

  const { data: apps } = await admin
    .from('applications').select('id, photo_path').eq('enrolled_user_id', userId)
  const photoPaths = (apps ?? []).map(a => a.photo_path).filter((p): p is string => !!p)

  // 2. Storage first — documents, then application photos.
  if (docPaths.length > 0) await admin.storage.from(DOCUMENTS_BUCKET).remove(docPaths)
  if (photoPaths.length > 0) await admin.storage.from(APPLICATION_PHOTO_BUCKET).remove(photoPaths)

  // 3. DB rows. Delete the linked application(s) explicitly to erase their data
  //    (and free the enrolled_user_id FK), then delete the auth user — which
  //    CASCADEs public.users -> assignments -> submissions -> field_answers /
  //    document_uploads and exchange_enrollments (see the cascade migration).
  await admin.from('applications').delete().eq('enrolled_user_id', userId)
  // Retried: this is the erasure itself. A bad_jwt here means the auth row and
  // everything cascading from it survive a request that reported success.
  //
  // NOTE: the result is still unchecked, as it always has been — a failure here
  // is silent, which for an erasure path deserves its own fix rather than a
  // behaviour change smuggled into a retry rollout.
  await withAuthAdminRetry(
    () => admin.auth.admin.deleteUser(userId),
    'retention.eraseSubject',
  )

  return {
    userId,
    documentsDeleted: docPaths.length,
    photosDeleted: photoPaths.length,
    applicationsDeleted: (apps ?? []).length,
  }
}

// Purge every uploaded document (rows + storage) under one exchange, without
// touching students or their form answers. Used by the sweep for exchanges
// archived past the documents retention window.
export async function purgeExchangeDocuments(exchangeId: string): Promise<PurgeDocumentsResult> {
  const admin = createAdminClient()

  const { data: templates } = await admin.from('form_templates').select('id').eq('exchange_id', exchangeId)
  const templateIds = (templates ?? []).map(t => t.id)
  if (templateIds.length === 0) return { exchangeId, documentsDeleted: 0 }

  const { data: assignments } = await admin.from('assignments').select('id').in('template_id', templateIds)
  const assignmentIds = (assignments ?? []).map(a => a.id)
  if (assignmentIds.length === 0) return { exchangeId, documentsDeleted: 0 }

  const { data: subs } = await admin.from('submissions').select('id').in('assignment_id', assignmentIds)
  const submissionIds = (subs ?? []).map(s => s.id)
  if (submissionIds.length === 0) return { exchangeId, documentsDeleted: 0 }

  const { data: uploads } = await admin
    .from('document_uploads').select('id, storage_path').in('submission_id', submissionIds)
  const paths = (uploads ?? []).map(u => u.storage_path)
  const ids = (uploads ?? []).map(u => u.id)
  if (paths.length === 0) return { exchangeId, documentsDeleted: 0 }

  // Storage first, then rows.
  await admin.storage.from(DOCUMENTS_BUCKET).remove(paths)
  await admin.from('document_uploads').delete().in('id', ids)
  return { exchangeId, documentsDeleted: paths.length }
}
