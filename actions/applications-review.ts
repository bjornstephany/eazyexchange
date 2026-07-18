'use server'
import { createClient } from '@/lib/supabase/server'
import { requireUser, requireOrganizer } from '@/lib/auth/require'
import { randomToken } from '@/lib/tokens'
import { applicantName as buildApplicantName } from '@/lib/application-form'
import { signApplicationPhotoUrls } from '@/lib/application-photos'
import { sendInvitationEmail, sendApplicationRejectionEmail } from '@/lib/email'
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
    .from('exchanges').select('name').eq('id', app.exchange_id).maybeSingle()
  const applicantName = buildApplicantName(app.data)
  void sendInvitationEmail({
    to: app.email, applicantName, exchangeName: exchange?.name ?? '',
    respondUrl: `${APP_URL}/invite/${inviteToken}`,
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
