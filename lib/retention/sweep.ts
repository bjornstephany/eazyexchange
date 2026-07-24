// lib/retention/sweep.ts
// Retention sweep orchestration. ON THE ADMIN ALLOWLIST (fetches candidates and
// deletes service-role-only rows). Pure durations come from ./rules; subject
// deletion goes through ./erase (storage-first). log-only counts; enforce
// deletes. Returns a PII-free count per category.

import { createAdminClient } from '@/lib/supabase/admin'
import { eraseApplication, purgeExchangeDocuments } from '@/lib/retention/erase'
import { cutoff, isDue } from '@/lib/retention/rules'

export type SweepMode = 'log-only' | 'enforce'
export type SweepSummary = Record<string, number>

type Admin = ReturnType<typeof createAdminClient>

async function purgeByAge(
  admin: Admin, mode: SweepMode, table: string, column: string, before: string,
): Promise<number> {
  if (mode === 'enforce') {
    const { count } = await admin.from(table as any).delete({ count: 'exact' }).lt(column, before)
    return count ?? 0
  }
  const { count } = await admin.from(table as any).select('*', { count: 'exact', head: true }).lt(column, before)
  return count ?? 0
}

async function submissionIdsForExchange(admin: Admin, exchangeId: string): Promise<string[]> {
  const { data: templates } = await admin.from('form_templates').select('id').eq('exchange_id', exchangeId)
  const templateIds = (templates ?? []).map((t: any) => t.id)
  if (templateIds.length === 0) return []
  const { data: assignments } = await admin.from('assignments').select('id').in('template_id', templateIds)
  const assignmentIds = (assignments ?? []).map((a: any) => a.id)
  if (assignmentIds.length === 0) return []
  const { data: subs } = await admin.from('submissions').select('id').in('assignment_id', assignmentIds)
  return (subs ?? []).map((s: any) => s.id)
}

export async function runRetentionSweep(now: Date, mode: SweepMode): Promise<SweepSummary> {
  const admin = createAdminClient()
  const summary: SweepSummary = {}

  // 1. Abandoned draft applications (via erase primitive).
  {
    const { data } = await admin.from('applications')
      .select('id').eq('status', 'draft').lt('updated_at', cutoff(now, 'abandonedDraftApplication'))
    const ids = (data ?? []).map((r: any) => r.id)
    summary.abandonedDraftApplication = ids.length
    if (mode === 'enforce') for (const id of ids) await eraseApplication(id)
  }

  // 2. Rejected / declined applicants (reviewed_at | responded_at).
  {
    const { data } = await admin.from('applications')
      .select('id, reviewed_at, responded_at').in('status', ['rejected', 'declined'])
    const due = (data ?? []).filter((r: any) =>
      isDue(now, r.reviewed_at ?? r.responded_at, 'rejectedApplicant'))
    summary.rejectedApplicant = due.length
    if (mode === 'enforce') for (const r of due) await eraseApplication(r.id)
  }

  // 3. Enrolled application rows.
  {
    const { data } = await admin.from('applications')
      .select('id').eq('status', 'enrolled').lt('updated_at', cutoff(now, 'enrolledApplicationRow'))
    const ids = (data ?? []).map((r: any) => r.id)
    summary.enrolledApplicationRow = ids.length
    if (mode === 'enforce') for (const id of ids) await eraseApplication(id)
  }

  // 4. Uploaded documents (rows + storage) for exchanges archived > 3mo.
  {
    const { data } = await admin.from('exchanges')
      .select('id').not('archived_at', 'is', null).lt('archived_at', cutoff(now, 'uploadedDocuments'))
    const exchangeIds = (data ?? []).map((r: any) => r.id)
    let docs = 0
    for (const id of exchangeIds) {
      if (mode === 'enforce') {
        docs += (await purgeExchangeDocuments(id)).documentsDeleted
      } else {
        const submissionIds = await submissionIdsForExchange(admin, id)
        if (submissionIds.length === 0) continue
        const { count } = await admin.from('document_uploads')
          .select('id', { count: 'exact', head: true }).in('submission_id', submissionIds)
        docs += count ?? 0
      }
    }
    summary.uploadedDocuments = docs
  }

  // 5. Enrolled form answers for exchanges archived > 12mo (field_answers only).
  {
    const { data } = await admin.from('exchanges')
      .select('id').not('archived_at', 'is', null).lt('archived_at', cutoff(now, 'enrolledFormAnswers'))
    const exchangeIds = (data ?? []).map((r: any) => r.id)
    let answers = 0
    for (const id of exchangeIds) {
      const submissionIds = await submissionIdsForExchange(admin, id)
      if (submissionIds.length === 0) continue
      if (mode === 'enforce') {
        const { count } = await admin.from('field_answers').delete({ count: 'exact' }).in('submission_id', submissionIds)
        answers += count ?? 0
      } else {
        const { count } = await admin.from('field_answers').select('id', { count: 'exact', head: true }).in('submission_id', submissionIds)
        answers += count ?? 0
      }
    }
    summary.enrolledFormAnswers = answers
  }

  // 6. Simple age-based, service-role-only row purges.
  summary.emailSendLog = await purgeByAge(admin, mode, 'email_send_log', 'created_at', cutoff(now, 'emailSendLog'))
  summary.communicationEvents = await purgeByAge(admin, mode, 'communication_events', 'created_at', cutoff(now, 'communicationEvents'))
  summary.auditLog = await purgeByAge(admin, mode, 'audit_log', 'created_at', cutoff(now, 'auditLog'))
  summary.rateLimits = await purgeByAge(admin, mode, 'rate_limits', 'window_start', cutoff(now, 'rateLimits'))

  // 7. Resolved error reports aged by last_seen_at.
  {
    const before = cutoff(now, 'errorReportsResolved')
    if (mode === 'enforce') {
      const { count } = await admin.from('error_reports').delete({ count: 'exact' })
        .eq('status', 'resolved').lt('last_seen_at', before)
      summary.errorReportsResolved = count ?? 0
    } else {
      const { count } = await admin.from('error_reports').select('id', { count: 'exact', head: true })
        .eq('status', 'resolved').lt('last_seen_at', before)
      summary.errorReportsResolved = count ?? 0
    }
  }

  // 8. Expired, unaccepted organizer invites.
  {
    const nowIso = now.toISOString()
    if (mode === 'enforce') {
      const { count } = await admin.from('organizer_invites').delete({ count: 'exact' })
        .is('accepted_at', null).lt('expires_at', nowIso)
      summary.expiredOrganizerInvites = count ?? 0
    } else {
      const { count } = await admin.from('organizer_invites').select('id', { count: 'exact', head: true })
        .is('accepted_at', null).lt('expires_at', nowIso)
      summary.expiredOrganizerInvites = count ?? 0
    }
  }

  return summary
}
