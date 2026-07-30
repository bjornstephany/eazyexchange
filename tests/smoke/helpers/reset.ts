import { SHAPES, TEMPLATES } from '../../../scripts/seed-cast.mjs'
import { resetStudentShape } from '../../../scripts/lib/student-shape.mjs'
import { adminDb } from './db'
import { SEED_DOMAIN } from './manifest'

// Reset runs per spec, not once per run: a Playwright retry after a
// half-finished mutation needs a clean slate as much as a first attempt does,
// and a globalSetup would run once and leave retries dirty. Every function here
// is a no-op when the rows are already in shape.
//
// In CI none of this is needed — the database is new each run. It is a
// local-only convenience that costs a few hundred milliseconds.

/** Put one reserved student back to the shape the seed gave them. */
export async function resetSmokeStudent(email: string): Promise<void> {
  const db = adminDb()

  const { data: student, error } = await db
    .from('users')
    .select('id, school_id')
    .eq('email', email)
    .maybeSingle()
  if (error) throw new Error(`reset ${email}: ${error.message}`)
  if (!student) {
    throw new Error(`${email} is not seeded. Run \`pnpm dev --reseed\`.`)
  }

  const { data: templates, error: tErr } = await db
    .from('form_templates')
    .select('id, standard_key')
    .eq('school_id', student.school_id)
  if (tErr) throw new Error(`reset ${email}: ${tErr.message}`)
  const byKey = new Map((templates ?? []).map((t) => [t.standard_key, t.id]))
  const templateIds = TEMPLATES.map((t) => byKey.get(t.key))

  // The reserved pair is `untouched`, so this reduces to a delete — but it goes
  // through the seed's own module so it can never disagree with it.
  await resetStudentShape({
    db,
    studentId: student.id,
    shape: SHAPES.untouched,
    templateIds,
  })
}

/**
 * Clear the anonymous funnel's traces: previous smoke applications, and the
 * per-IP / per-email counters. startApplication caps a source IP at 10 starts
 * per hour and fails closed on the mail-sending tier — without this, the
 * eleventh `pnpm ship` in an hour would fail for a reason that is not a bug.
 */
export async function resetApplyFunnel(): Promise<void> {
  const db = adminDb()
  const { error } = await db
    .from('applications')
    .delete()
    .like('email', `smoke-apply-%@${SEED_DOMAIN}`)
  if (error) throw new Error(`reset apply funnel: ${error.message}`)
  const { error: rlErr } = await db.from('rate_limits').delete().like('key', 'apply_%')
  if (rlErr) throw new Error(`reset apply rate limits: ${rlErr.message}`)
}

/**
 * Delete the pending organizers a previous signup spec created, and the blank
 * schools provisionOrganizer made for them. seed-demo.mjs's wipe() removes the
 * auth users (they are @seed.example.com) but not those schools, so they would
 * otherwise pile up.
 */
export async function resetSignupCruft(): Promise<void> {
  const db = adminDb()
  const { data: rows, error } = await db
    .from('users')
    .select('id, school_id')
    .like('email', `smoke-signup-%@${SEED_DOMAIN}`)
  if (error) throw new Error(`reset signup cruft: ${error.message}`)
  for (const row of rows ?? []) {
    // users → schools → auth.users: users.school_id blocks the school delete,
    // and the auth row is not FK-cascaded from either.
    await db.from('users').delete().eq('id', row.id)
    if (row.school_id) await db.from('schools').delete().eq('id', row.school_id)
    await db.auth.admin.deleteUser(row.id)
  }

  // Waitlist rows and the per-IP signup counter. requestOrganizerSignup caps a
  // source IP at 10 signups per hour and fails CLOSED, so without this the
  // eleventh `pnpm ship` in an hour would fail for a reason that is not a bug.
  const { error: wlErr } = await db
    .from('signup_waitlist').delete().like('email', `%@${SEED_DOMAIN}`)
  if (wlErr) throw new Error(`reset signup waitlist: ${wlErr.message}`)
  const { error: rlErr } = await db.from('rate_limits').delete().like('key', 'signup:%')
  if (rlErr) throw new Error(`reset signup rate limits: ${rlErr.message}`)
}
