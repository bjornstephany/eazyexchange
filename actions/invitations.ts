'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applicantName as buildApplicantName } from '@/lib/application-form'
import { assertExchangeWritable } from '@/lib/exchange-guard'
import { getAppUrl } from '@/lib/app-url'
import { tokenExpired } from '@/lib/tokens'
import { sendChecklistEmail } from '@/lib/email'

const APP_URL = getAppUrl()

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
    .select('id, email, school_id, exchange_id, data').maybeSingle()
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
