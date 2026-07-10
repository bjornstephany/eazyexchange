'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAnonClient } from '@/lib/supabase/anon'
import { createClient } from '@/lib/supabase/server'
import { requireUser, requireOrganizer } from '@/lib/auth/require'
import { randomToken } from '@/lib/tokens'
import { normalizeEmail, isValidEmail, hasOverlongAnswer, MAX_ANSWER_LENGTH } from '@/lib/validation'
import { missingRequiredApplication, applicantName as buildApplicantName } from '@/lib/application-form'
import { validateUploadFile } from '@/lib/uploads'
import { enforceRateLimit, enforceRateLimitStrict, clientIp } from '@/lib/rate-limit'
import {
  sendApplicationResumeEmail, sendApplicationConfirmationEmail, sendNewApplicationAlertEmail,
  sendInvitationEmail, sendApplicationRejectionEmail,
} from '@/lib/email'
import { revalidatePath } from 'next/cache'
import { assertExchangeWritable } from '@/lib/exchange-guard'
import { getAppUrl } from '@/lib/app-url'
import { logAudit } from '@/lib/audit'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'

const APP_URL = getAppUrl()
const PHOTO_BUCKET = 'application-photos'

function applicationsClosed(exchange: { application_open: boolean; application_deadline: string | null }): boolean {
  if (!exchange.application_open) return true
  if (exchange.application_deadline) {
    const today = new Date().toISOString().slice(0, 10)
    if (today > exchange.application_deadline) return true
  }
  return false
}

const RESUME_FALLBACK_MS = 30 * 24 * 60 * 60 * 1000
const INVITE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// When a resume link should die: end of the deadline day (the day after, 00:00
// UTC — the moment applicationsClosed flips), or 30 days out if no deadline.
function resumeExpiry(deadline: string | null): string {
  if (deadline) return new Date(new Date(`${deadline}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000).toISOString()
  return new Date(Date.now() + RESUME_FALLBACK_MS).toISOString()
}

function tokenExpired(expiresAt: string | null): boolean {
  return expiresAt != null && new Date(expiresAt).getTime() < Date.now()
}

// Hard sanity cap, not a product limit: no legitimate exchange approaches this
// (typical cohorts are 20–60 students). Protects the shared DB/storage from
// rotating-IP bulk fakes that the per-IP/per-email rate limits can't see.
// Not exported: a `'use server'` module may only export async functions, and
// nothing outside this file consumes it (the cap is enforced below).
const APPLICATION_CAP_PER_EXCHANGE = 2000

export type StartApplicationResult = { token: string } | { existing: 'draft' | 'submitted' } | { closed: true }

export async function startApplication(
  slug: string,
  input: { email: string; first_name: string; last_name: string; language: 'en' | 'fr' },
): Promise<StartApplicationResult> {
  const email = normalizeEmail(input.email)
  if (!isValidEmail(email)) throw new Error('Please enter a valid email address')

  // This endpoint is unauthenticated and emails an arbitrary address, so cap it
  // by source IP and by recipient to prevent enumeration / mail-bombing from our
  // sending domain. Per-email is the tighter limit (don't re-mail the same victim).
  const ip = await clientIp()
  await enforceRateLimit(`apply_ip:${ip}`, 10, 3600)
  await enforceRateLimitStrict(`apply_email:${email}`, 3, 3600)

  const admin = createAdminClient()
  const { data: exchange } = await admin
    .from('exchanges')
    .select('id, name, school_a_id, application_open, application_deadline')
    .eq('apply_slug', slug)
    .maybeSingle()
  if (!exchange) throw new Error('Application not found')
  if (applicationsClosed(exchange)) throw new Error('Applications are closed for this exchange')
  await assertExchangeWritable(admin, exchange.id)

  // One email = one application per exchange. Any existing row blocks a new
  // insert. Structured results, not thrown errors: prod redacts Server Action
  // error messages, and the client must branch on the outcome.
  const { data: existing } = await admin
    .from('applications')
    .select('id, status, resume_token')
    .eq('exchange_id', exchange.id)
    .eq('email', email)
    .maybeSingle()
  if (existing) {
    if (existing.status !== 'draft') {
      // Includes rejected: rejection is final and the public screen never
      // advertises it — same neutral "already submitted" outcome.
      return { existing: 'submitted' }
    }
    // Typing an email is not proof of owning it: never return the existing
    // token. The inbox is the only recovery channel — re-send the resume link
    // (already capped by the 3/hr-per-email limit above) and keep it alive.
    await admin.from('applications')
      .update({ resume_token_expires_at: resumeExpiry(exchange.application_deadline) })
      .eq('id', existing.id)
    void sendApplicationResumeEmail({
      to: email,
      exchangeName: exchange.name,
      resumeUrl: `${APP_URL}/apply/resume/${existing.resume_token}`,
      ctx: { schoolId: exchange.school_a_id, exchangeId: exchange.id },
    }).catch(() => {})
    return { existing: 'draft' }
  }

  // Per-exchange sanity cap — abuse guard only; existing applicants resumed
  // above are never affected. Fail open on a count error: a DB blip must not
  // block a legitimate applicant (same convention as the rate limiter).
  const { count, error: countError } = await admin
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('exchange_id', exchange.id)
  if (!countError && (count ?? 0) >= APPLICATION_CAP_PER_EXCHANGE) {
    return { closed: true }
  }

  const token = randomToken()
  const { error } = await admin.from('applications').insert({
    exchange_id: exchange.id,
    school_id: exchange.school_a_id,
    email,
    resume_token: token,
    invite_token: null,
    resume_token_expires_at: resumeExpiry(exchange.application_deadline),
    invite_token_expires_at: null,
    status: 'draft',
    language: input.language,
    data: { first_name: input.first_name.trim(), last_name: input.last_name.trim(), email },
    photo_path: null,
    invite_response: null,
    invite_response_note: null,
    responded_at: null,
    enrolled_user_id: null,
    submitted_at: null,
    reviewed_at: null,
    reviewer_id: null,
    review_note: null,
  }).select('id').single()
  if (error) {
    // Two tabs raced past the pre-check; the unique index rejected the loser.
    // Map to the same structured response by re-reading the winning row (the
    // winner's own request already sent the resume email).
    if ((error as { code?: string }).code === '23505') {
      const { data: winner } = await admin
        .from('applications')
        .select('status')
        .eq('exchange_id', exchange.id)
        .eq('email', email)
        .maybeSingle()
      return { existing: winner?.status === 'draft' ? 'draft' : 'submitted' }
    }
    throw error
  }

  // Silent cross-device safety net: email the resume link the moment they start,
  // fire-and-forget so a mail hiccup never blocks entry into the form. The
  // same-device return path is localStorage (client-side); this covers cleared
  // storage / a different device. Already gated by the rate limits above.
  void sendApplicationResumeEmail({
    to: email,
    exchangeName: exchange.name,
    resumeUrl: `${APP_URL}/apply/resume/${token}`,
    ctx: { schoolId: exchange.school_a_id, exchangeId: exchange.id },
  }).catch(() => {})

  return { token }
}

export async function getApplicationDraft(token: string) {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('status, data, language, photo_path, resume_token_expires_at, exchanges(name, apply_slug)')
    .eq('resume_token', token)
    .maybeSingle()
  if (!app) return null
  const exchangeName = app.exchanges?.name ?? ''
  // Don't return PII through an expired link.
  if (tokenExpired(app.resume_token_expires_at)) {
    return { expired: true as const, submitted: false as const, exchangeName }
  }
  // Once submitted (or further along) the application is final — the resume link
  // can no longer reopen it. Return a marker only, never the PII, so the page
  // shows an "already submitted" notice instead of the form.
  if (app.status !== 'draft') {
    return { expired: false as const, submitted: true as const, exchangeName }
  }
  // Signed URL so a returning draft shows its already-uploaded photo (the
  // application-photos bucket is private; 1 h outlives any editing session).
  let photoUrl: string | null = null
  if (app.photo_path) {
    const { data: signed } = await admin.storage.from(PHOTO_BUCKET)
      .createSignedUrl(app.photo_path, 3600)
    photoUrl = signed?.signedUrl ?? null
  }
  return {
    expired: false as const, submitted: false as const,
    status: app.status, data: app.data ?? {}, language: app.language,
    photo_path: app.photo_path, photoUrl, exchangeName,
    slug: app.exchanges?.apply_slug ?? '',
  }
}

// Read-only "is this stored token still a live draft?" for the same-device
// welcome-back screen. Ships only a first name + language to the browser — never
// the rest of the draft PII. No rate limit: the caller already holds the token
// (it was in their own localStorage); nothing is emailed or enumerable.
export async function peekApplicationDraft(
  token: string,
): Promise<{ live: boolean; firstName: string | null; language: 'en' | 'fr' }> {
  // Anon-key RPC (not the service role): returns status + first name only.
  const anon = createAnonClient()
  const { data: app } = await anon
    .rpc('peek_application_draft', { p_token: token })
    .maybeSingle()
  const language: 'en' | 'fr' = app?.language === 'fr' ? 'fr' : 'en'
  if (!app || tokenExpired(app.resume_token_expires_at) || app.status !== 'draft') {
    return { live: false, firstName: null, language }
  }
  return { live: true, firstName: app.first_name, language }
}

// Emails the applicant their private resume link on demand ("Finish later").
// Only valid while the application is still an open draft.
export async function sendApplicationResumeLink(token: string): Promise<void> {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('email, status, resume_token_expires_at, school_id, exchange_id, exchanges(name)')
    .eq('resume_token', token).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (tokenExpired(app.resume_token_expires_at)) throw new Error('This application link has expired.')
  if (app.status !== 'draft') throw new Error('This application has already been submitted.')

  // This mails the applicant's address, so cap by IP + recipient to prevent
  // mail-bombing from our sending domain (mirrors startApplication's old gate).
  const ip = await clientIp()
  await enforceRateLimit(`resume_ip:${ip}`, 10, 3600)
  await enforceRateLimitStrict(`resume_email:${app.email}`, 3, 3600)

  await sendApplicationResumeEmail({
    to: app.email,
    exchangeName: app.exchanges?.name ?? '',
    resumeUrl: `${APP_URL}/apply/resume/${token}`,
    ctx: { schoolId: app.school_id, exchangeId: app.exchange_id },
  })
}

export async function saveApplicationDraft(token: string, data: Record<string, string>): Promise<void> {
  if (hasOverlongAnswer(data)) throw new Error(`An answer exceeds the ${MAX_ANSWER_LENGTH}-character limit.`)
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications').select('id, status, resume_token_expires_at, exchange_id').eq('resume_token', token).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (tokenExpired(app.resume_token_expires_at)) throw new Error('This application link has expired.')
  if (app.status !== 'draft') throw new Error('This application is already submitted and locked')
  await assertExchangeWritable(admin, app.exchange_id)
  const { error } = await admin
    .from('applications').update({ data }).eq('resume_token', token)
  if (error) throw error
}

export async function submitApplication(token: string, data: Record<string, string>): Promise<void> {
  if (hasOverlongAnswer(data)) throw new Error(`An answer exceeds the ${MAX_ANSWER_LENGTH}-character limit.`)

  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('id, status, email, exchange_id, school_id, resume_token_expires_at, photo_path')
    .eq('resume_token', token).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (tokenExpired(app.resume_token_expires_at)) throw new Error('This application link has expired.')
  if (app.status !== 'draft') throw new Error('This application is already submitted')

  // Server-side backstop of the client submit gate — same policy, including
  // the photo (which lives on the row, not in `data`).
  const missing = missingRequiredApplication(data, { hasPhoto: app.photo_path != null })
  if (missing.length > 0) throw new Error('Please complete all required fields before submitting.')

  // Re-check the window at submit time: startApplication gated it, but the
  // organizer may have closed applications (or the deadline passed) while this
  // draft was open.
  const { data: exchange } = await admin
    .from('exchanges')
    .select('name, application_open, application_deadline')
    .eq('id', app.exchange_id).maybeSingle()
  if (!exchange) throw new Error('Application not found')
  if (applicationsClosed(exchange)) throw new Error('Applications are closed for this exchange')
  await assertExchangeWritable(admin, app.exchange_id)

  const { error } = await admin.from('applications').update({
    data, status: 'submitted', submitted_at: new Date().toISOString(),
  }).eq('resume_token', token)
  if (error) throw error

  // Emails: applicant confirmation + organizer alert. Fire-and-forget.
  const applicantName = buildApplicantName(data)
  void sendApplicationConfirmationEmail({
    to: app.email, applicantName, exchangeName: exchange?.name ?? '',
    ctx: { schoolId: app.school_id, exchangeId: app.exchange_id },
  }).catch(() => {})
  const { data: organizers } = await admin
    .from('users').select('email').eq('school_id', app.school_id).eq('role', 'organizer')
  void Promise.all((organizers ?? []).map(org =>
    sendNewApplicationAlertEmail({
      to: org.email, applicantName, exchangeName: exchange?.name ?? '',
      reviewUrl: `${APP_URL}/exchanges/${app.exchange_id}/applications`,
      ctx: { schoolId: app.school_id, exchangeId: app.exchange_id },
    }).catch(() => {})
  ))
}

export async function uploadApplicationPhoto(token: string, formData: FormData): Promise<{ path: string }> {
  const file = formData.get('photo')
  if (!(file instanceof File)) throw new Error('No file provided')
  const err = validateUploadFile({ type: file.type, size: file.size })
  if (err) throw new Error(err)
  if (!file.type.startsWith('image/')) throw new Error('Please upload an image file')

  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications').select('id, status, resume_token_expires_at, exchange_id').eq('resume_token', token).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (tokenExpired(app.resume_token_expires_at)) throw new Error('This application link has expired.')
  if (app.status !== 'draft') throw new Error('This application is already submitted and locked')
  await assertExchangeWritable(admin, app.exchange_id)

  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${app.id}/photo.${ext}`
  const { error: upErr } = await admin.storage.from(PHOTO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (upErr) throw upErr
  const { error } = await admin.from('applications').update({ photo_path: path }).eq('id', app.id)
  if (error) throw error
  return { path }
}

// ---- Organizer actions (authenticated, RLS-enforced) ----

async function assertOrganizerOwnsApplication(supabase: SupabaseClient<Database>, applicationId: string) {
  const { profile } = await requireOrganizer()
  const { data: app } = await supabase
    .from('applications').select('*').eq('id', applicationId).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (app.school_id !== profile.school_id) throw new Error('Unauthorized')
  return app
}

export async function listApplications(exchangeId: string) {
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
  const { data, error } = await supabase
    .from('applications')
    // Only the columns the Candidatures view + dashboard rollups consume (AppRow).
    // Avoids shipping the private resume_token / invite_token to the browser.
    .select('id, status, submitted_at, data, email')
    .eq('exchange_id', exchangeId)
    .neq('status', 'draft')
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getApplicationForReview(applicationId: string) {
  const supabase = await createClient()
  await requireUser()
  const application = await assertOrganizerOwnsApplication(supabase, applicationId)

  let photoUrl: string | null = null
  if (application.photo_path) {
    // Organizer authorization already verified above; use admin to sign the URL
    // (the application-photos bucket has no per-user storage policy).
    const admin = createAdminClient()
    const { data } = await admin.storage.from(PHOTO_BUCKET)
      .createSignedUrl(application.photo_path, 3600)
    photoUrl = data?.signedUrl ?? null
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

// ---- Public invitation response (keyed by invite_token) ----

export async function getInvitation(token: string) {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications').select('status, data, invite_token_expires_at, exchanges(name)').eq('invite_token', token).maybeSingle()
  if (!app) return null
  const applicantName = buildApplicantName(app.data)
  return {
    exchangeName: app.exchanges?.name ?? '', applicantName, status: app.status,
    expired: tokenExpired(app.invite_token_expires_at),
  }
}

export async function respondToInvitation(
  token: string, response: 'yes' | 'no' | 'maybe', note: string,
): Promise<void> {
  const admin = createAdminClient()

  // Reject an expired invite link up front with a clear message (the atomic
  // updates below would otherwise just report "no longer open").
  const { data: pre } = await admin
    .from('applications').select('id, invite_token_expires_at, exchange_id').eq('invite_token', token).maybeSingle()
  if (!pre) throw new Error('Invitation not found')
  if (tokenExpired(pre.invite_token_expires_at)) throw new Error('This invitation has expired.')
  await assertExchangeWritable(admin, pre.exchange_id)

  const base = {
    invite_response: response, invite_response_note: note || null,
    responded_at: new Date().toISOString(),
  }

  // 'no' / 'maybe' are single atomic updates, gated on the invite still being
  // open. `.in('status', [...])` makes the guard race-safe (a second click that
  // arrives after the first updates nothing → "no longer open").
  if (response === 'no' || response === 'maybe') {
    const { data: updated } = await admin
      .from('applications')
      .update({ ...base, status: response === 'no' ? 'declined' : 'maybe' })
      .eq('invite_token', token).in('status', ['accepted', 'maybe'])
      .select('id').maybeSingle()
    if (!updated) {
      // Distinguish "doesn't exist" from "already responded" for a clearer error.
      const { data: exists } = await admin
        .from('applications').select('id').eq('invite_token', token).maybeSingle()
      throw new Error(exists ? 'This invitation is no longer open' : 'Invitation not found')
    }
    return
  }

  // 'yes' → atomically CLAIM the invite (accepted/maybe → enrolling) before
  // touching auth. Only one concurrent/retried request wins the claim, so the
  // account-creation sequence runs exactly once.
  const { data: claimed } = await admin
    .from('applications')
    // Clicking « Oui » is the explicit terms acknowledgment (the respond page
    // shows the notice right under the button). Stamped at claim time and
    // deliberately KEPT if the claim is later released back to 'accepted' —
    // it records that the acknowledgment click happened. A retry overwrites
    // it with the newer click.
    .update({ ...base, status: 'enrolling', terms_acknowledged_at: new Date().toISOString() })
    .eq('invite_token', token).in('status', ['accepted', 'maybe'])
    .select('id, email, school_id, exchange_id').maybeSingle()
  if (!claimed) {
    const { data: cur } = await admin
      .from('applications').select('status').eq('invite_token', token).maybeSingle()
    if (!cur) throw new Error('Invitation not found')
    // A parallel request already claimed it (enrolling) or finished (enrolled) —
    // treat as success so a double-click doesn't surface a scary error.
    if (cur.status === 'enrolling' || cur.status === 'enrolled') return
    throw new Error('This invitation is no longer open')
  }

  let userId: string
  try {
    // Create the auth account + profile + enrollment via the Supabase invite
    // email. trg_assign_on_enrollment_insert fans out the Phase 2 assignments.
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(claimed.email, {
      redirectTo: `${APP_URL}/accept-invite`,
    })
    if (inviteError) {
      if (inviteError.code === 'email_exists') throw new Error('An account already exists for this email')
      throw inviteError
    }
    userId = invited.user.id
    // Empty full_name: middleware infers "setup
    // complete" from a non-empty full_name, so pre-filling it would bounce the
    // student past /accept-invite before they set a password.
    const { error: profileError } = await admin.from('users').insert({
      id: userId, school_id: claimed.school_id, role: 'student' as const,
      email: claimed.email, full_name: '',
    })
    if (profileError) {
      await admin.auth.admin.deleteUser(userId).catch(() => {})
      if (profileError.code === '23505') throw new Error('An account already exists for this email')
      throw profileError
    }
    const { error: enrollError } = await admin.from('exchange_enrollments').insert({
      exchange_id: claimed.exchange_id, user_id: userId,
    })
    if (enrollError && enrollError.code !== '23505') {
      await admin.from('users').delete().eq('id', userId)
      await admin.auth.admin.deleteUser(userId).catch(() => {})
      throw enrollError
    }
  } catch (err) {
    // Account creation failed (and any partial account was rolled back above):
    // release the claim back to 'accepted' so the applicant can retry cleanly.
    await admin.from('applications')
      .update({ status: 'accepted' }).eq('id', claimed.id).eq('status', 'enrolling')
    throw err
  }

  // Account + enrollment exist. Finalize enrolling → enrolled (now error-checked).
  // If this rare last step fails we deliberately leave the row 'enrolling' rather
  // than releasing it: the account is live, so reverting to 'accepted' would
  // dead-end a retry on email_exists. A retry instead hits the claim-fail branch
  // above and returns success.
  const { error: finalErr } = await admin.from('applications')
    .update({ status: 'enrolled', enrolled_user_id: userId }).eq('id', claimed.id)
  if (finalErr) throw finalErr
  // No revalidatePath: the caller is the unauthenticated invitee, whose browser
  // never renders organizer tabs — revalidation here would be inert. The
  // organizer seeing the enrollment within staleTimes.dynamic is the spec's
  // accepted cross-actor staleness trade-off (§1c).
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
