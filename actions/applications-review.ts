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
import { templateHasUnfilledPlaceholders, templateHasLiteralPlaceholders } from '@/lib/good-news-template'
import {
  missingGoodNewsFields,
  type GoodNewsField,
  type GoodNewsValues,
} from '@/lib/exchange/good-news-fields'
import { revalidatePath } from 'next/cache'
import { assertExchangeWritable, ARCHIVED_ERROR } from '@/lib/exchange-guard'
import { getAppUrl } from '@/lib/app-url'
import { logAudit } from '@/lib/audit'
import { recordCommunicationEvent } from '@/lib/communication/events'
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
  responded_at: string | null
  data: Record<string, string>
  email: string
  photoUrl?: string | null
}

// The detail read for one application. Deliberately not `select('*')`: the row
// carries resume_token / invite_token, which the review screen has no use for
// and which must never travel further than they have to. Mirrors
// REVIEW_COLUMNS below. Consumers: getApplicationForReview (photo_path,
// school_id) and components/applications/ApplicationDetail.tsx.
const REVIEW_DETAIL_COLUMNS =
  'id, exchange_id, school_id, status, email, data, photo_path, invite_response, invite_response_note, review_note'

async function assertOrganizerOwnsApplication(supabase: SupabaseClient<Database>, applicationId: string) {
  const { profile } = await requireOrganizer()
  const { data: app } = await supabase
    .from('applications').select(REVIEW_DETAIL_COLUMNS).eq('id', applicationId).maybeSingle()
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
      .select('id, status, submitted_at, responded_at, data, email')
      .eq('exchange_id', exchangeId)
      .or('status.neq.draft,invited_at.not.is.null')
      .order('submitted_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as ApplicationListRow[]
  }

  const { data, error } = await supabase
    .from('applications')
    .select('id, status, submitted_at, responded_at, data, email, photo_path')
    .eq('exchange_id', exchangeId)
    .or('status.neq.draft,invited_at.not.is.null')
    .order('submitted_at', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as unknown as (ApplicationListRow & { photo_path: string | null })[]

  // Organizer authorization verified above — signApplicationPhotoUrls uses the
  // service-role client (the bucket has no per-user storage policy).
  const paths = rows.map(r => r.photo_path).filter((p): p is string => p !== null)
  const urlByPath = await signApplicationPhotoUrls(paths)
  return rows.map(r => ({
    id: r.id, status: r.status, submitted_at: r.submitted_at, responded_at: r.responded_at,
    data: r.data, email: r.email,
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

// ---- Application review (single + bulk share one engine) ----
//
// Both the single-item actions and the Candidatures bulk buttons run through
// reviewApplications(). Accepting 30 candidates used to mean 30 × (fetch
// application → fetch exchange → update → audit → fetch exchange again), all
// sequential — ~150 round trips in a row. The shared reads are now hoisted out
// of the loop and the per-application writes run concurrently, so the batch
// costs two reads plus one parallel write wave whatever its size.
//
// Keeping one engine also keeps the rules that matter — school ownership, the
// archived-exchange gate, the status guards — impossible to drift between the
// single and bulk paths.

type ReviewOp =
  | { kind: 'accept'; personalNote: string | null }
  | { kind: 'reject'; note: string; sendEmail: boolean }

// Why an accept was refused before it started. `missing` names the Réglages →
// Programme values that are still empty; `literal` says the template also (or
// instead) carries placeholder text the organizer typed by hand, which no
// amount of filling Réglages will fix. Both are needed: they send the organizer
// to two different screens.
export type AcceptBlock = { missing: GoodNewsField[]; literal: boolean }

type ReviewOutcome =
  | { ok: true }
  | { ok: false; error: Error }
  | { ok: false; blocked: AcceptBlock }

type ReviewRow = {
  id: string
  exchange_id: string
  school_id: string
  status: string
  email: string
  language: string | null
  data: Record<string, string>
}

type ReviewExchange = {
  id: string
  archived_at: string | null
  name: string
  good_news_subject: string | null
  good_news_body: string | null
}

// Deliberately not `select('*')`: this read is wide (every id in the batch),
// and the row carries resume_token / invite_token, which have no business
// here. Same rule as REVIEW_DETAIL_COLUMNS on the detail read.
const REVIEW_COLUMNS = 'id, exchange_id, school_id, status, email, language, data'

// Only a submitted application can be accepted — plus a rejected one, which is
// the organizer deliberately changing their mind (they may attach a personal
// note; see acceptApplication). `declined` is absent on purpose: once the
// student has said no, only a fresh application can restart the flow. This is
// the server-side backstop for the UI lock in ApplicationReviewActions.
const ACCEPTABLE_STATUSES = ['submitted', 'rejected']
// Never reject an application that has already enrolled (which would leave the
// student's account, enrollment and assignments live while showing rejected),
// nor one that was never submitted / already declined.
const REJECTABLE_STATUSES = ['submitted', 'accepted', 'maybe']

async function reviewApplications(ids: string[], op: ReviewOp): Promise<ReviewOutcome[]> {
  if (ids.length === 0) return []
  const supabase = await createClient()
  const { user, profile } = await requireOrganizer()

  // One read for every application in the batch...
  const { data: rows } = await supabase
    .from('applications').select(REVIEW_COLUMNS).in('id', ids)
  const byId = new Map(((rows ?? []) as ReviewRow[]).map(r => [r.id, r]))

  // ...and one for every exchange they belong to, covering both the
  // archived-write gate and the email template the accept path needs.
  const exchangeIds = [...new Set([...byId.values()].map(r => r.exchange_id))]
  const exchangeById = new Map<string, ReviewExchange>()
  if (exchangeIds.length > 0) {
    const { data: exchanges } = await supabase
      .from('exchanges')
      .select('id, archived_at, name, good_news_subject, good_news_body')
      .in('id', exchangeIds)
    for (const ex of (exchanges ?? []) as ReviewExchange[]) exchangeById.set(ex.id, ex)
  }

  // The values that fill the acceptance email's {{travel_dates}} &c. Read for
  // accepts only — a reject sends a different email that has no placeholders.
  // RLS scopes this the same way it scopes the exchanges read above.
  const detailsById = new Map<string, GoodNewsValues>()
  const blockByExchange = new Map<string, AcceptBlock>()
  if (op.kind === 'accept' && exchangeIds.length > 0) {
    const { data: details } = await supabase
      .from('exchange_program_details')
      .select('exchange_id, travel_start, travel_end, participation_cost, payment_details, confirmation_deadline')
      .in('exchange_id', exchangeIds)
    for (const d of (details ?? []) as (GoodNewsValues & { exchange_id: string })[]) {
      detailsById.set(d.exchange_id, d)
    }
    // One pre-flight per exchange, not per application: the template and the
    // details are the same for every candidate in the batch, so a blocked
    // exchange blocks all of them with one answer.
    for (const exchangeId of exchangeIds) {
      const exchange = exchangeById.get(exchangeId)
      const d = detailsById.get(exchangeId) ?? null
      const unfilled = templateHasUnfilledPlaceholders({
        subject: exchange?.good_news_subject ?? null,
        body: exchange?.good_news_body ?? null,
        details: d,
      })
      if (!unfilled) continue
      blockByExchange.set(exchangeId, {
        missing: missingGoodNewsFields(d),
        literal: templateHasLiteralPlaceholders({
          subject: exchange?.good_news_subject ?? null,
          body: exchange?.good_news_body ?? null,
        }),
      })
    }
  }

  const reviewedAt = new Date().toISOString()
  const outcomes = await Promise.all(
    ids.map(async (id): Promise<ReviewOutcome> => {
      try {
        const app = byId.get(id)
        if (!app) throw new Error('Application not found')
        // RLS already scopes the read to the caller's school; this refuses a
        // foreign id outright so a future RLS refactor cannot silently open it.
        if (app.school_id !== profile.school_id) throw new Error('Unauthorized')
        const exchange = exchangeById.get(app.exchange_id)
        if (exchange?.archived_at) throw new Error(ARCHIVED_ERROR)

        if (op.kind === 'accept') {
          if (!ACCEPTABLE_STATUSES.includes(app.status)) {
            throw new Error('Only a submitted application can be accepted')
          }
          // Refuse BEFORE any write. The « Bonne nouvelle » email is the whole
          // point of accepting, so an accept whose email would carry
          // « [à compléter] » to a family is not a partial success to be
          // patched up later — nothing happens at all, and the organizer is
          // told exactly what to fill in.
          const blocked = blockByExchange.get(app.exchange_id)
          if (blocked) return { ok: false, blocked }

          // Every accepted application gets its own invite token — this is why
          // the batch cannot collapse into a single multi-row UPDATE.
          const inviteToken = randomToken()
          const { error } = await supabase.from('applications').update({
            status: 'accepted', invite_token: inviteToken,
            invite_token_expires_at: new Date(Date.now() + INVITE_WINDOW_MS).toISOString(),
            reviewed_at: reviewedAt, reviewer_id: user.id, review_note: null,
          }).eq('id', id)
          if (error) throw error

          await logAudit({
            action: 'application.accepted',
            actorUserId: user.id,
            actorSchoolId: app.school_id,
            targetType: 'application',
            targetId: id,
            metadata: { exchange_id: app.exchange_id },
          })

          // Awaited, not fire-and-forget: Historique must record what actually
          // happened. This does NOT serialize a bulk accept — the whole
          // per-application body already runs inside Promise.all over ids, so
          // the Resend calls stay parallel; the action just waits for the
          // slowest round-trip.
          const sent = await sendGoodNewsEmail({
            to: parentRecipients(app.data as Record<string, string>, app.email),
            studentName: buildApplicantName(app.data),
            exchangeName: exchange?.name ?? '',
            subject: exchange?.good_news_subject ?? null,
            body: exchange?.good_news_body ?? null,
            details: detailsById.get(app.exchange_id) ?? null,
            respondUrl: `${APP_URL}/invite/${inviteToken}`,
            language: app.language === 'fr' ? 'fr' : 'en',
            personalNote: op.personalNote,
            ctx: { schoolId: app.school_id, exchangeId: app.exchange_id },
          }).catch(() => false)

          await recordCommunicationEvent(supabase, {
            exchangeId: app.exchange_id,
            actorId: user.id,
            applicationId: id,
            kind: 'good_news_sent',
            subject: buildApplicantName(app.data),
            status: sent ? 'ok' : 'failed',
          })
          return { ok: true }
        }

        if (!REJECTABLE_STATUSES.includes(app.status)) {
          throw new Error('This application can no longer be rejected.')
        }
        const { error } = await supabase.from('applications').update({
          status: 'rejected', reviewed_at: reviewedAt,
          reviewer_id: user.id, review_note: op.note || null,
        }).eq('id', id)
        if (error) throw error

        await logAudit({
          action: 'application.rejected',
          actorUserId: user.id,
          actorSchoolId: app.school_id,
          targetType: 'application',
          targetId: id,
          metadata: { exchange_id: app.exchange_id, email_sent: op.sendEmail },
        })

        if (op.sendEmail) {
          void sendApplicationRejectionEmail({
            to: app.email,
            applicantName: buildApplicantName(app.data),
            exchangeName: exchange?.name ?? '',
            note: op.note,
            ctx: { schoolId: app.school_id, exchangeId: app.exchange_id },
          }).catch(() => {})
        }
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e : new Error('Review failed') }
      }
    }),
  )

  for (const exchangeId of exchangeIds) revalidatePath(`/exchanges/${exchangeId}/applications`)
  revalidatePath('/applications')
  revalidatePath('/dashboard')
  return outcomes
}

// `opts.personalNote` is the "change your mind" message an organizer may attach
// when re-inviting a candidate they had rejected. Empty/whitespace collapses to
// null so the email renders no note block.
//
// A refused-because-incomplete accept is a STRUCTURED return, not a throw:
// production replaces thrown Server Action messages with an opaque digest, and
// the organizer has to be told which values are missing. Genuine failures (not
// found, unauthorized, archived) still throw — those are unexpected.
export async function acceptApplication(
  applicationId: string,
  opts?: { personalNote?: string },
): Promise<{ ok: true } | { ok: false; blocked: AcceptBlock }> {
  const [outcome] = await reviewApplications([applicationId], {
    kind: 'accept', personalNote: opts?.personalNote?.trim() || null,
  })
  if (outcome && !outcome.ok) {
    if ('blocked' in outcome) return { ok: false, blocked: outcome.blocked }
    throw outcome.error
  }
  return { ok: true }
}

export async function rejectApplication(applicationId: string, note: string, sendEmail: boolean): Promise<void> {
  const [outcome] = await reviewApplications([applicationId], { kind: 'reject', note, sendEmail })
  // A reject can never be blocked — only the accept path sends the templated email.
  if (outcome && !outcome.ok && 'error' in outcome) throw outcome.error
}

// ---- Bulk organizer actions (dashboard Candidatures view) ----

// Per-id failures never abort the batch: a mixed selection partially succeeds
// and the view reports the tally.
//
// A block is reported once for the whole batch, not once per candidate: the
// template and the Réglages values are per exchange, so 30 blocked candidates
// have one cause and one fix. Where a selection spans exchanges the first block
// wins — the organizer fixes it, retries, and meets the next one if any.
function tally(outcomes: ReviewOutcome[]): BulkReviewResult {
  let succeeded = 0
  let failed = 0
  let blocked: AcceptBlock | null = null
  for (const o of outcomes) {
    if (o.ok) { succeeded++; continue }
    failed++
    if ('blocked' in o && !blocked) blocked = o.blocked
  }
  return { succeeded, failed, blocked }
}

export type BulkReviewResult = { succeeded: number; failed: number; blocked: AcceptBlock | null }

export async function acceptApplications(ids: string[]): Promise<BulkReviewResult> {
  // Bulk accept carries no personal note — one message cannot fit 30 families.
  return tally(await reviewApplications(ids, { kind: 'accept', personalNote: null }))
}

export async function rejectApplications(ids: string[], note: string, sendEmail: boolean): Promise<{ succeeded: number; failed: number }> {
  return tally(await reviewApplications(ids, { kind: 'reject', note, sendEmail }))
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
