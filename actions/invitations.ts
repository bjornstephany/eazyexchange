'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { applicantName as buildApplicantName } from '@/lib/application-form'
import { assertExchangeWritable, ARCHIVED_ERROR } from '@/lib/exchange-guard'
import { tokenExpired } from '@/lib/tokens'
import { sendChecklistEmail } from '@/lib/email'
import { inviteError, type InviteActionResult } from '@/lib/invite-response'

// ---- Public invitation response (keyed by invite_token) ----

export async function getInvitation(token: string) {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('status, data, invite_token_expires_at, enrolled_user_id, exchanges(name)')
    .eq('invite_token', token).maybeSingle()
  if (!app) return null
  const applicantName = buildApplicantName(app.data)
  // For enrolled/enrolling invites, report whether account setup finished so
  // the invite page can offer « reprendre la configuration » vs. a login link.
  // Same signal middleware uses: a non-empty full_name means setup is done.
  let setupComplete: boolean | null = null
  if (app.status === 'enrolling' || app.status === 'enrolled') {
    setupComplete = false
    if (app.enrolled_user_id) {
      const { data: profile } = await admin
        .from('users').select('full_name').eq('id', app.enrolled_user_id).maybeSingle()
      setupComplete = !!profile?.full_name
    }
  }
  return {
    exchangeName: app.exchanges?.name ?? '', applicantName, status: app.status,
    expired: tokenExpired(app.invite_token_expires_at),
    setupComplete,
  }
}

// Module-private sentinel so the catch-and-release block below can tell the
// one *expected* account-creation failure apart from genuine unexpected ones.
class InviteEmailExistsError extends Error {}

export async function respondToInvitation(
  token: string, response: 'yes' | 'no' | 'maybe', note: string,
): Promise<InviteActionResult> {
  const admin = createAdminClient()

  // Reject an expired invite link up front with a clear message (the atomic
  // updates below would otherwise just report "no longer open").
  const { data: pre } = await admin
    .from('applications').select('id, invite_token_expires_at, exchange_id').eq('invite_token', token).maybeSingle()
  if (!pre) return inviteError('not_found')
  if (tokenExpired(pre.invite_token_expires_at)) return inviteError('expired')
  try { await assertExchangeWritable(admin, pre.exchange_id) }
  catch (err) {
    if (err instanceof Error && err.message === ARCHIVED_ERROR) return inviteError('archived')
    throw err
  }

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
      return inviteError(exists ? 'closed' : 'not_found')
    }
    return { ok: true }
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
    .select('id, email, school_id, exchange_id, data').maybeSingle()
  if (!claimed) {
    const { data: cur } = await admin
      .from('applications').select('status, email').eq('invite_token', token).maybeSingle()
    if (!cur) return inviteError('not_found')
    // A parallel request already claimed it (enrolling) or finished (enrolled).
    // Mint the session anyway so a double-click — or a deliberate retry after a
    // mint failure — still lands the student on /accept-invite instead of the
    // old silent no-op that stranded them.
    if (cur.status === 'enrolling' || cur.status === 'enrolled') {
      const minted = await mintInviteSession(admin, cur.email)
      return minted ? { ok: true } : inviteError('retry')
    }
    return inviteError('closed')
  }

  let userId: string
  try {
    // Create the auth account directly — confirmed, no email sent. Possessing
    // the invite token already proves mailbox access (the link was delivered
    // by Resend to this address), so no activation round-trip is needed.
    // trg_assign_on_enrollment_insert fans out the Phase 2 assignments.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: claimed.email, email_confirm: true,
    })
    if (createError || !created?.user) {
      if (createError?.code === 'email_exists') throw new InviteEmailExistsError()
      throw createError ?? new Error('createUser returned no user')
    }
    userId = created.user.id
    // Empty full_name: middleware infers "setup
    // complete" from a non-empty full_name, so pre-filling it would bounce the
    // student past /accept-invite before they set a password.
    const { error: profileError } = await admin.from('users').insert({
      id: userId, school_id: claimed.school_id, role: 'student' as const,
      email: claimed.email, full_name: '',
    })
    if (profileError) {
      await admin.auth.admin.deleteUser(userId).catch(() => {})
      if (profileError.code === '23505') throw new InviteEmailExistsError()
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
    if (err instanceof InviteEmailExistsError) return inviteError('email_exists')
    throw err
  }

  // Account + enrollment exist. Finalize enrolling → enrolled (now error-checked).
  // If this rare last step fails we deliberately leave the row 'enrolling' rather
  // than releasing it: the account is live, so reverting to 'accepted' would
  // dead-end a retry on email_exists. A retry instead hits the claim-fail branch
  // above and mints a session.
  const { error: finalErr } = await admin.from('applications')
    .update({ status: 'enrolled', enrolled_user_id: userId }).eq('id', claimed.id)
  if (finalErr) throw finalErr
  // No revalidatePath: the caller is the unauthenticated invitee, whose browser
  // never renders organizer tabs — revalidation here would be inert. The
  // organizer seeing the enrollment within staleTimes.dynamic is the spec's
  // accepted cross-actor staleness trade-off (§1c).

  // One checklist email at enrollment: the DB trigger
  // (trg_assign_on_enrollment_insert) has just fanned out the assignments,
  // so list what's pending. Best-effort — never breaks the enrollment.
  await sendEnrollmentChecklist(admin, {
    userId,
    email: claimed.email,
    studentName: buildApplicantName(claimed.data as Record<string, string> | null),
    schoolId: claimed.school_id,
    exchangeId: claimed.exchange_id,
  })

  // Sign the student in right here: the server action may write cookies, so
  // verifyOtp on the cookie-aware client establishes the session in-page and
  // the client just router.push()es to /accept-invite. If this rare last step
  // fails, enrollment stands — the structured retry error tells the student to
  // click « Oui » again, which lands in the claim-fail branch above.
  const minted = await mintInviteSession(admin, claimed.email)
  return minted ? { ok: true } : inviteError('retry')
}

// Abandoned-setup recovery: the invite page shows « Reprendre la configuration »
// for an enrolled/enrolling invite whose account setup never finished. Token
// possession + unexpired window is the same trust respondToInvitation relies on.
export async function resumeInviteSetup(token: string): Promise<InviteActionResult> {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('status, email, invite_token_expires_at')
    .eq('invite_token', token).maybeSingle()
  if (!app) return inviteError('not_found')
  if (tokenExpired(app.invite_token_expires_at)) return inviteError('expired')
  if (app.status !== 'enrolled' && app.status !== 'enrolling') return inviteError('closed')
  const minted = await mintInviteSession(admin, app.email)
  return minted ? { ok: true } : inviteError('retry')
}

// generateLink returns the hashed OTP token WITHOUT sending any email; verifying
// it on the cookie-aware server client is exactly what /auth/confirm does with
// the emailed link — minus the email. Magiclink (not invite-type) because it
// also works for existing users, which the retry/recovery paths need.
async function mintInviteSession(
  admin: ReturnType<typeof createAdminClient>, email: string,
): Promise<boolean> {
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const tokenHash = data?.properties?.hashed_token
    if (error || !tokenHash) return false
    const supabase = await createClient()
    const { error: otpError } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
    return !otpError
  } catch {
    // Never log the email (PII); the caller surfaces the structured retry error.
    return false
  }
}

async function sendEnrollmentChecklist(
  admin: ReturnType<typeof createAdminClient>,
  opts: { userId: string; email: string; studentName: string; schoolId: string; exchangeId: string },
): Promise<void> {
  try {
    const [{ data: exchange }, { data: templates }] = await Promise.all([
      admin.from('exchanges').select('name').eq('id', opts.exchangeId).single(),
      admin.from('form_templates')
        .select('id, name, deadline')
        .eq('exchange_id', opts.exchangeId).eq('school_id', opts.schoolId).eq('status', 'active'),
    ])
    if (!exchange || !templates || templates.length === 0) return

    const templateById = new Map(templates.map(t => [t.id, t]))
    const { data: assignments } = await admin
      .from('assignments')
      .select('template_id, submissions(status)')
      .eq('student_id', opts.userId)
      .in('template_id', templates.map(t => t.id))

    const items: { name: string; deadline: string | null }[] = []
    for (const a of assignments ?? []) {
      const submission = Array.isArray(a.submissions) ? a.submissions[0] : a.submissions
      const status = submission?.status ?? null
      if (status === 'submitted' || status === 'approved') continue
      const t = templateById.get(a.template_id)
      if (t) items.push({ name: t.name, deadline: t.deadline })
    }
    if (items.length === 0) return

    await sendChecklistEmail({
      to: opts.email, studentName: opts.studentName, exchangeName: exchange.name, items,
      ctx: { schoolId: opts.schoolId, exchangeId: opts.exchangeId },
    })
  } catch {
    // Never log the student email (PII); the enrollment itself already succeeded.
    console.warn('[invitations] enrollment checklist email failed — enrollment unaffected')
  }
}
