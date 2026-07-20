'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser, requireOrganizer } from '@/lib/auth/require'
import { randomToken, resumeTokenExpiry } from '@/lib/tokens'
import { parseInviteEmails, MAX_INVITE_BATCH } from '@/lib/invite-emails'
import { applicantName as buildApplicantName, parentRecipients } from '@/lib/application-form'
import { signApplicationPhotoUrls } from '@/lib/application-photos'
import { enforceRateLimit } from '@/lib/rate-limit'
import { sendGoodNewsEmail, sendApplicationRejectionEmail, sendApplicationInviteEmail } from '@/lib/email'
import { revalidatePath } from 'next/cache'
import { assertExchangeWritable } from '@/lib/exchange-guard'
import { getAppUrl } from '@/lib/app-url'
import { logAudit } from '@/lib/audit'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'

const APP_URL = getAppUrl()
const INVITE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// ---- Organizer actions (authenticated, RLS-enforced) ----

// Row shape shipped to the Candidatures view / dashboard rollups. photoUrl is
// present only when the caller asked for photos; photo_path itself never
// leaves the server — only the signed URL does.
export type ApplicationListRow = {
  id: string
  status: string
  submitted_at: string | null
  data: Record<string, string>
  email: string
  photoUrl?: string | null
}

async function assertOrganizerOwnsApplication(supabase: SupabaseClient<Database>, applicationId: string) {
  const { profile } = await requireOrganizer()
  const { data: app } = await supabase
    .from('applications').select('*').eq('id', applicationId).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (app.school_id !== profile.school_id) throw new Error('Unauthorized')
  return app
}

export async function listApplications(
  exchangeId: string,
  opts?: { withPhotos?: boolean },
): Promise<ApplicationListRow[]> {
  const supabase = await createClient()
  const { profile } = await requireOrganizer()
  // Belt-and-suspenders with RLS (which already scopes rows to the caller's
  // school — proven by tests/rls/matrix.test.ts): refuse foreign exchange ids
  // outright so a future RLS refactor can never silently open this read.
  // Same shape as assertOrganizerInExchange in actions/students.ts.
  const { data: exchange } = await supabase
    .from('exchanges')
    .select('school_a_id, school_b_id')
    .eq('id', exchangeId)
    .maybeSingle()
  if (!exchange || (exchange.school_a_id !== profile.school_id && exchange.school_b_id !== profile.school_id)) {
    throw new Error('Unauthorized')
  }

  if (!opts?.withPhotos) {
    const { data, error } = await supabase
      .from('applications')
      // Only the columns the Candidatures view + dashboard rollups consume (AppRow).
      // Avoids shipping the private resume_token / invite_token to the browser.
      .select('id, status, submitted_at, data, email')
      .eq('exchange_id', exchangeId)
      .neq('status', 'draft')
      .order('submitted_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as ApplicationListRow[]
  }

  const { data, error } = await supabase
    .from('applications')
    .select('id, status, submitted_at, data, email, photo_path')
    .eq('exchange_id', exchangeId)
    .neq('status', 'draft')
    .order('submitted_at', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as unknown as (ApplicationListRow & { photo_path: string | null })[]

  // Organizer authorization verified above — signApplicationPhotoUrls uses the
  // service-role client (the bucket has no per-user storage policy).
  const paths = rows.map(r => r.photo_path).filter((p): p is string => p !== null)
  const urlByPath = await signApplicationPhotoUrls(paths)
  return rows.map(r => ({
    id: r.id, status: r.status, submitted_at: r.submitted_at, data: r.data, email: r.email,
    photoUrl: r.photo_path ? urlByPath.get(r.photo_path) ?? null : null,
  }))
}

export async function getApplicationForReview(applicationId: string) {
  const supabase = await createClient()
  await requireUser()
  const application = await assertOrganizerOwnsApplication(supabase, applicationId)

  let photoUrl: string | null = null
  if (application.photo_path) {
    // Organizer authorization already verified above (assertOrganizerOwnsApplication).
    const urls = await signApplicationPhotoUrls([application.photo_path])
    photoUrl = urls.get(application.photo_path) ?? null
  }
  return { application, photoUrl }
}

export async function acceptApplication(applicationId: string): Promise<void> {
  const supabase = await createClient()
  const user = await requireUser()
  const app = await assertOrganizerOwnsApplication(supabase, applicationId)
  if (app.status !== 'submitted' && app.status !== 'rejected') {
    throw new Error('Only a submitted application can be accepted')
  }
  await assertExchangeWritable(supabase, app.exchange_id)
  const inviteToken = randomToken()
  const { error } = await supabase.from('applications').update({
    status: 'accepted', invite_token: inviteToken,
    invite_token_expires_at: new Date(Date.now() + INVITE_WINDOW_MS).toISOString(),
    reviewed_at: new Date().toISOString(), reviewer_id: user.id, review_note: null,
  }).eq('id', applicationId)
  if (error) throw error

  await logAudit({
    action: 'application.accepted',
    actorUserId: user.id,
    actorSchoolId: app.school_id,
    targetType: 'application',
    targetId: applicationId,
    metadata: { exchange_id: app.exchange_id },
  })

  const { data: exchange } = await supabase
    .from('exchanges')
    .select('name, good_news_subject, good_news_body')
    .eq('id', app.exchange_id).maybeSingle()
  const applicantName = buildApplicantName(app.data)
  const recipients = parentRecipients(app.data as Record<string, string>, app.email)
  void sendGoodNewsEmail({
    to: recipients,
    studentName: applicantName,
    exchangeName: exchange?.name ?? '',
    subject: exchange?.good_news_subject ?? null,
    body: exchange?.good_news_body ?? null,
    respondUrl: `${APP_URL}/invite/${inviteToken}`,
    language: app.language === 'fr' ? 'fr' : 'en',
    ctx: { schoolId: app.school_id, exchangeId: app.exchange_id },
  }).catch(() => {})
  revalidatePath(`/exchanges/${app.exchange_id}/applications`)
  revalidatePath('/applications')
  revalidatePath('/dashboard')
}

export async function rejectApplication(applicationId: string, note: string, sendEmail: boolean): Promise<void> {
  const supabase = await createClient()
  const user = await requireUser()
  const app = await assertOrganizerOwnsApplication(supabase, applicationId)
  // Never reject an application that has already enrolled (which would leave the
  // student's account, enrollment and assignments live while showing rejected),
  // nor one that was never submitted / already declined.
  if (!['submitted', 'accepted', 'maybe'].includes(app.status)) {
    throw new Error('This application can no longer be rejected.')
  }
  await assertExchangeWritable(supabase, app.exchange_id)
  const { error } = await supabase.from('applications').update({
    status: 'rejected', reviewed_at: new Date().toISOString(),
    reviewer_id: user.id, review_note: note || null,
  }).eq('id', applicationId)
  if (error) throw error

  await logAudit({
    action: 'application.rejected',
    actorUserId: user.id,
    actorSchoolId: app.school_id,
    targetType: 'application',
    targetId: applicationId,
    metadata: { exchange_id: app.exchange_id, email_sent: sendEmail },
  })

  if (sendEmail) {
    const { data: exchange } = await supabase
      .from('exchanges').select('name').eq('id', app.exchange_id).maybeSingle()
    const applicantName = buildApplicantName(app.data)
    void sendApplicationRejectionEmail({
      to: app.email, applicantName, exchangeName: exchange?.name ?? '', note,
      ctx: { schoolId: app.school_id, exchangeId: app.exchange_id },
    }).catch(() => {})
  }
  revalidatePath(`/exchanges/${app.exchange_id}/applications`)
  revalidatePath('/applications')
  revalidatePath('/dashboard')
}

// ---- Bulk organizer actions (dashboard Candidatures view) ----

// Bulk review from the Candidatures view. Loops the single-item actions so all
// side effects (invitation email, status guards, ownership assertion) stay in
// one place; per-id failures don't abort the batch.
export async function acceptApplications(ids: string[]): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0
  let failed = 0
  for (const id of ids) {
    try { await acceptApplication(id); succeeded++ } catch { failed++ }
  }
  revalidatePath('/applications')
  return { succeeded, failed }
}

export async function rejectApplications(ids: string[], note: string, sendEmail: boolean): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0
  let failed = 0
  for (const id of ids) {
    try { await rejectApplication(id, note, sendEmail); succeeded++ } catch { failed++ }
  }
  revalidatePath('/applications')
  return { succeeded, failed }
}

// ---- Organizer-sent application invitations ----

export type SendInvitationsResult =
  | { ok: false; notOpen: true }
  | { ok: false; tooMany: true }
  | { ok: true; sent: number; skippedExchange: number; skippedElsewhere: number; invalid: number }

// Bulk-invite students by email from the portal. Admin client (allowlisted):
// it bulk-inserts rows AND emails arbitrary addresses, so it carries the same
// rate-limited service-role posture as the anonymous funnel (actions/apply.ts).
export async function sendApplicationInvitations(
  exchangeId: string, rawEmails: string,
): Promise<SendInvitationsResult> {
  const { user, profile } = await requireOrganizer()
  const admin = createAdminClient()

  const { data: exchange } = await admin
    .from('exchanges')
    .select('id, name, school_a_id, application_open, application_deadline')
    .eq('id', exchangeId)
    .maybeSingle()
  // Only the applicant-side school (school_a) owns the application funnel.
  if (!exchange || exchange.school_a_id !== profile.school_id) throw new Error('Unauthorized')
  await assertExchangeWritable(admin, exchange.id)

  // Must be open with a live deadline (same gate as the copy-link path).
  const today = new Date().toISOString().slice(0, 10)
  const open = exchange.application_open
    && !!exchange.application_deadline
    && today <= exchange.application_deadline
  if (!open) return { ok: false, notOpen: true }

  const { valid, invalid } = parseInviteEmails(rawEmails)
  if (valid.length > MAX_INVITE_BATCH) return { ok: false, tooMany: true }
  if (valid.length === 0) {
    return { ok: true, sent: 0, skippedExchange: 0, skippedElsewhere: 0, invalid: invalid.length }
  }

  // Per-organizer cap on bulk sends from our domain.
  await enforceRateLimit(`invite_send:${user.id}`, 10, 3600)

  // School-wide dedup: one email = one application per school.
  const { data: existing } = await admin
    .from('applications')
    .select('email, exchange_id')
    .eq('school_id', exchange.school_a_id)
    .in('email', valid)
  const hereEmails = new Set((existing ?? []).filter(r => r.exchange_id === exchange.id).map(r => r.email))
  const elsewhereEmails = new Set(
    (existing ?? []).filter(r => r.exchange_id !== exchange.id).map(r => r.email),
  )
  const toCreate = valid.filter(e => !hereEmails.has(e) && !elsewhereEmails.has(e))
  const skippedElsewhere = valid.filter(e => elsewhereEmails.has(e) && !hereEmails.has(e)).length

  const expiry = resumeTokenExpiry(exchange.application_deadline)
  const invitedAt = new Date().toISOString()
  const rows = toCreate.map(email => ({
    exchange_id: exchange.id, school_id: exchange.school_a_id, email,
    resume_token: randomToken(), invite_token: null,
    resume_token_expires_at: expiry, invite_token_expires_at: null,
    status: 'invited', language: 'fr', data: { email }, photo_path: null,
    invite_response: null, invite_response_note: null, responded_at: null,
    enrolled_user_id: null, submitted_at: null, reviewed_at: null,
    reviewer_id: null, review_note: null, invited_at: invitedAt,
  }))

  // ON CONFLICT DO NOTHING on the (exchange_id, email) unique index: a self-serve
  // start that raced our dedup read is skipped, not an error. .select() returns
  // only the rows actually inserted.
  let inserted: { email: string; resume_token: string }[] = []
  if (rows.length > 0) {
    const { data, error } = await admin
      .from('applications')
      .upsert(rows, { onConflict: 'exchange_id,email', ignoreDuplicates: true })
      .select('email, resume_token')
    if (error) throw error
    inserted = (data ?? []) as { email: string; resume_token: string }[]
  }
  const raceSkipped = toCreate.length - inserted.length
  const skippedExchange = hereEmails.size + raceSkipped

  // Await the sends (a serverless action would kill fire-and-forget promises
  // after return). send() swallows per-recipient failures; there is no resend.
  await Promise.allSettled(inserted.map(r =>
    sendApplicationInviteEmail({
      to: r.email,
      exchangeName: exchange.name,
      applyUrl: `${APP_URL}/apply/resume/${r.resume_token}`,
      ctx: { schoolId: exchange.school_a_id, exchangeId: exchange.id },
    }),
  ))

  revalidatePath('/applications')
  revalidatePath('/dashboard')
  return { ok: true, sent: inserted.length, skippedExchange, skippedElsewhere, invalid: invalid.length }
}
