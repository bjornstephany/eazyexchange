'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAnonClient } from '@/lib/supabase/anon'
import { randomToken, tokenExpired, resumeTokenExpiry } from '@/lib/tokens'
import { normalizeEmail, isValidEmail, hasOverlongAnswer, MAX_ANSWER_LENGTH } from '@/lib/validation'
import { missingRequiredApplication, overLimitApplicationFields, applicantName as buildApplicantName } from '@/lib/application-form'
import { validateUploadFile, APPLICATION_PHOTO_BUCKET } from '@/lib/uploads'
import { enforceRateLimit, enforceRateLimitStrict, clientIp } from '@/lib/rate-limit'
import {
  sendApplicationResumeEmail, sendApplicationConfirmationEmail, sendNewApplicationAlertEmail,
} from '@/lib/email'
import { assertExchangeWritable } from '@/lib/exchange-guard'
import { getAppUrl } from '@/lib/app-url'
import { renderApplicationRecapPdf } from '@/lib/pdf/application-recap'

const APP_URL = getAppUrl()

function applicationsClosed(exchange: { application_open: boolean; application_deadline: string | null }): boolean {
  if (!exchange.application_open) return true
  if (exchange.application_deadline) {
    const today = new Date().toISOString().slice(0, 10)
    if (today > exchange.application_deadline) return true
  }
  return false
}

// Hard sanity cap, not a product limit: no legitimate exchange approaches this
// (typical cohorts are 20–60 students). Protects the shared DB/storage from
// rotating-IP bulk fakes that the per-IP/per-email rate limits can't see.
// Not exported: a `'use server'` module may only export async functions, and
// nothing outside this file consumes it (the cap is enforced below).
const APPLICATION_CAP_PER_EXCHANGE = 2000

export type StartApplicationResult =
  | { token: string }
  | { existing: 'draft' | 'submitted' }
  | { closed: true }
  | { invalidEmail: true }
  | { registered: true }

// Structured result for the two draft-writing actions: expected validation
// outcomes must be return values, never throws (prod redacts thrown messages).
export type ApplyWriteResult =
  | { ok: true }
  | { ok: false; overLimit: string[] }
  | { ok: false; registered: true }

export async function startApplication(
  slug: string,
  input: { email: string; first_name: string; last_name: string; language: 'en' | 'fr' },
): Promise<StartApplicationResult> {
  const email = normalizeEmail(input.email)
  // Expected validation outcome, not an exception: prod redacts thrown Server
  // Action messages to an opaque digest, so return a structured result the
  // client can render as a friendly "use a valid email" message.
  if (!isValidEmail(email)) return { invalidEmail: true }

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
      .update({ resume_token_expires_at: resumeTokenExpiry(exchange.application_deadline) })
      .eq('id', existing.id)
    void sendApplicationResumeEmail({
      to: email,
      exchangeName: exchange.name,
      resumeUrl: `${APP_URL}/apply/resume/${existing.resume_token}`,
      ctx: { schoolId: exchange.school_a_id, exchangeId: exchange.id },
    }).catch(() => {})
    return { existing: 'draft' }
  }

  // One email = one application across this whole school. A prior row in ANY
  // other exchange of the same school means this person is already in the funnel
  // (typically already enrolled elsewhere) — refuse the second application up
  // front instead of letting them fill everything out and only hit email_exists
  // at « Oui ». At this point the same-exchange lookup above already returned, so
  // any match here is necessarily a different exchange. Structured result, not a
  // throw: the client renders a neutral "already registered — log in" message.
  const { data: elsewhere } = await admin
    .from('applications')
    .select('id')
    .eq('school_id', exchange.school_a_id)
    .eq('email', email)
    .neq('exchange_id', exchange.id)
    .limit(1)
    .maybeSingle()
  if (elsewhere) return { registered: true }

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
    resume_token_expires_at: resumeTokenExpiry(exchange.application_deadline),
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
  // shows an "already submitted" notice instead of the form. `language` is the
  // one non-marker field: it carries no PII and the page needs it to render the
  // recap-download button in the language the applicant applied in.
  // 'invited' (organizer-sent, untouched) and 'draft' both render the form.
  if (app.status !== 'draft' && app.status !== 'invited') {
    return {
      expired: false as const, submitted: true as const, exchangeName,
      language: app.language === 'fr' ? ('fr' as const) : ('en' as const),
    }
  }
  // Signed URL so a returning draft shows its already-uploaded photo (the
  // application-photos bucket is private; 1 h outlives any editing session).
  let photoUrl: string | null = null
  if (app.photo_path) {
    const { data: signed } = await admin.storage.from(APPLICATION_PHOTO_BUCKET)
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

export async function saveApplicationDraft(token: string, data: Record<string, string>): Promise<ApplyWriteResult> {
  if (hasOverlongAnswer(data)) throw new Error(`An answer exceeds the ${MAX_ANSWER_LENGTH}-character limit.`)
  const overLimit = overLimitApplicationFields(data)
  if (overLimit.length > 0) return { ok: false, overLimit }
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications').select('id, status, resume_token_expires_at, exchange_id').eq('resume_token', token).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (tokenExpired(app.resume_token_expires_at)) throw new Error('This application link has expired.')
  if (app.status !== 'draft' && app.status !== 'invited') throw new Error('This application is already submitted and locked')
  await assertExchangeWritable(admin, app.exchange_id)
  // First edit of an organizer-invited row marks it "started".
  const patch: { data: Record<string, string>; status?: 'draft' } =
    app.status === 'invited' ? { data, status: 'draft' } : { data }
  const { error } = await admin
    .from('applications').update(patch).eq('resume_token', token)
  if (error) throw error
  return { ok: true }
}

export async function submitApplication(token: string, data: Record<string, string>): Promise<ApplyWriteResult> {
  if (hasOverlongAnswer(data)) throw new Error(`An answer exceeds the ${MAX_ANSWER_LENGTH}-character limit.`)
  const overLimit = overLimitApplicationFields(data)
  if (overLimit.length > 0) return { ok: false, overLimit }

  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('id, status, email, exchange_id, school_id, resume_token_expires_at, photo_path')
    .eq('resume_token', token).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (tokenExpired(app.resume_token_expires_at)) throw new Error('This application link has expired.')
  if (app.status !== 'draft' && app.status !== 'invited') throw new Error('This application is already submitted')

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

  // Race backstop for the start-time duplicate guard: if this email started this
  // draft and THEN entered the funnel in another exchange of the school (a
  // parallel session), block here rather than letting the eventual « Oui » hit
  // email_exists. Same per-school rule as startApplication; the same-exchange row
  // being submitted is excluded by .neq('exchange_id', …).
  const { data: elsewhere } = await admin
    .from('applications')
    .select('id')
    .eq('school_id', app.school_id)
    .eq('email', app.email)
    .neq('exchange_id', app.exchange_id)
    .limit(1)
    .maybeSingle()
  if (elsewhere) return { ok: false, registered: true }

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
  return { ok: true }
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
  if (app.status !== 'draft' && app.status !== 'invited') throw new Error('This application is already submitted and locked')
  await assertExchangeWritable(admin, app.exchange_id)

  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${app.id}/photo.${ext}`
  const { error: upErr } = await admin.storage.from(APPLICATION_PHOTO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (upErr) throw upErr
  // First upload of an organizer-invited row marks it "started".
  const patch: { photo_path: string; status?: 'draft' } =
    app.status === 'invited' ? { photo_path: path, status: 'draft' } : { photo_path: path }
  const { error } = await admin.from('applications').update(patch).eq('id', app.id)
  if (error) throw error
  return { path }
}

export type RecapResult =
  | { ok: true; filename: string; pdf: string /* base64 */ }
  | { ok: false; reason: 'not_found' | 'expired' | 'not_submitted' }

// ASCII-folded, lowercase, hyphenated name part for the download filename —
// « Dupont-Léger » → "dupont-leger". Not exported: a `'use server'` module may
// only export async functions.
function slugPart(value: string): string {
  return (value ?? '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function recapFilename(data: Record<string, string>): string {
  const parts = [slugPart(data.first_name ?? ''), slugPart(data.last_name ?? '')].filter(Boolean)
  return parts.length > 0 ? `candidature-${parts.join('-')}.pdf` : 'candidature.pdf'
}

// The applicant's own answers, back to the applicant, as a PDF they can keep.
//
// DELIBERATE PII EGRESS — read this next to getApplicationDraft above, which
// returns NO PII once status !== 'draft'. This action does the opposite on
// purpose: it returns the answers *because* they are submitted. The trust model
// is unchanged (the resume token is the applicant's own secret, and the token's
// expiry still gates it); it is simply a second, narrower door for the same
// person. It is not a mistake — do not "fix" it to match the branch above.
export async function downloadApplicationRecap(token: string): Promise<RecapResult> {
  // Same anonymous-token preamble as the other actions in this file.
  const ip = await clientIp()
  await enforceRateLimit(`recap_ip:${ip}`, 20, 3600)

  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('status, data, language, photo_path, submitted_at, resume_token_expires_at, exchanges(name)')
    .eq('resume_token', token)
    .maybeSingle()
  // Structured returns, not throws: prod redacts thrown Server Action messages.
  if (!app) return { ok: false, reason: 'not_found' }
  if (tokenExpired(app.resume_token_expires_at)) return { ok: false, reason: 'expired' }
  // Only a submitted (or further-along) application has a recap.
  if (app.status === 'draft' || app.status === 'invited') return { ok: false, reason: 'not_submitted' }

  // A broken or unreadable upload must not cost the applicant their recap:
  // drop the photo and render the rest. Logged without PII.
  let photoBytes: Uint8Array | null = null
  if (app.photo_path) {
    try {
      const { data: blob, error } = await admin.storage
        .from(APPLICATION_PHOTO_BUCKET).download(app.photo_path)
      if (error || !blob) throw new Error('download failed')
      photoBytes = new Uint8Array(await blob.arrayBuffer())
    } catch {
      console.warn('[apply] recap photo unavailable — rendering without it')
      photoBytes = null
    }
  }

  const data = (app.data ?? {}) as Record<string, string>
  const pdf = await renderApplicationRecapPdf({
    exchangeName: app.exchanges?.name ?? '',
    applicantName: buildApplicantName(data),
    submittedAt: app.submitted_at,
    data,
    photoBytes,
    language: app.language === 'fr' ? 'fr' : 'en',
  })

  return { ok: true, filename: recapFilename(data), pdf: pdf.toString('base64') }
}
