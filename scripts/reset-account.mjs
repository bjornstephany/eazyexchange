#!/usr/bin/env node
/**
 * `pnpm reset-account <email> [--yes]` — delete an account and everything it
 * owns, so the signup → guided-tour walkthrough cycle can be run again. (There
 * is no onboarding step any more: `/onboarding` was removed 2026-08-13, and a
 * confirmed organizer lands straight on the empty /dashboard.)
 *
 * public.users is the target of four ON DELETE NO ACTION foreign keys and
 * schools of five more, so this is not a dashboard click. The order below is
 * derived from the live FK graph (verified 2026-07-30), not guessed: a missed
 * NO ACTION child turns this into a half-delete that leaves the account both
 * unusable AND undeletable.
 *
 * Unlike `pnpm seed`, this does NOT refuse production — guard 1 is what makes
 * that safe. It resolves its target from the environment, so it points at the
 * local stack by default and at prod only if .env.prod is deliberately sourced:
 *
 *   node scripts/reset-account.mjs me@example.com --yes                  # local
 *   set -a; source .env.prod; set +a; node scripts/reset-account.mjs …   # prod
 */
import { createClient } from '@supabase/supabase-js'
import { LOCAL_API_URL, LOCAL_SERVICE_KEY, isLocalSupabaseUrl } from './lib/local-target.mjs'

const argv = process.argv.slice(2)
const yes = argv.includes('--yes')
const email = (argv.find((a) => !a.startsWith('--')) ?? '').trim().toLowerCase()

const die = (...lines) => {
  process.stderr.write(`\n  ✗ ${lines.join('\n    ')}\n\n`)
  process.exit(1)
}

if (!email) die('Usage: pnpm reset-account <email> [--yes]')

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const url = !envUrl || isLocalSupabaseUrl(envUrl) ? (envUrl ?? LOCAL_API_URL) : envUrl
const serviceKey = isLocalSupabaseUrl(url)
  ? (process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_SERVICE_KEY)
  : process.env.SUPABASE_SERVICE_ROLE_KEY
if (!serviceKey) die(`No SUPABASE_SERVICE_ROLE_KEY for ${url}.`)

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

// lib/supabase/admin-retry.ts is TypeScript and cannot be imported here, so the
// same policy is restated: retry ONLY bad_jwt. Supabase's sb_secret_ keys fail
// ~20% of auth-admin calls that way, and an unretried failure leaves an orphan
// auth row — which makes the NEXT signup fail with email_exists, exactly the
// loop this script exists to escape. A bare 403 is Cloudflare's block, not a
// transient auth fault, and must never be retried.
// See docs/security/supabase-secret-key-bad-jwt.md.
async function withAuthAdminRetry(fn, label, attempts = 4) {
  for (let i = 1; ; i++) {
    const res = await fn()
    if (!res?.error || res.error.code !== 'bad_jwt' || i >= attempts) return res
    process.stdout.write(`    ↻ ${label}: bad_jwt, retry ${i}/${attempts - 1}\n`)
    await new Promise((r) => setTimeout(r, 150 * i))
  }
}

const must = (label) => ({ error }) => {
  if (error) die(`${label}: ${error.message}`)
}
const ids = (rows, key = 'id') => (rows ?? []).map((r) => r[key])
const paths = (rows, key) => (rows ?? []).map((r) => r[key]).filter(Boolean)

// --- resolve the target ------------------------------------------------------

const { data: target, error: targetError } = await db
  .from('users').select('id, school_id, role').eq('email', email).maybeSingle()
if (targetError) die(`Lookup failed: ${targetError.message}`)
if (!target) die(`No account for ${email} on ${url}.`)

const { data: members, error: membersError } = await db
  .from('users').select('id, email').eq('school_id', target.school_id)
if (membersError) die(`Member lookup failed: ${membersError.message}`)

// --- guards, all checked before anything is deleted --------------------------

// 1. Structurally impossible to delete a real customer: only an address the
//    owner has deliberately allowlisted can be reset.
const { data: allow, error: allowError } = await db
  .from('signup_allowlist').select('email').eq('email', email).maybeSingle()
if (allowError) die(`Allowlist lookup failed: ${allowError.message}`)
if (!allow) {
  die(
    `${email} is not on signup_allowlist.`,
    'This script only resets accounts you have deliberately allowlisted.',
  )
}

// 2. Refuse to nuke a co-owned school out from under a colleague.
const { data: allowedRows, error: allowedError } = await db
  .from('signup_allowlist').select('email').in('email', members.map((m) => m.email))
if (allowedError) die(`Allowlist lookup failed: ${allowedError.message}`)
const allowed = new Set((allowedRows ?? []).map((r) => r.email))
const strangers = members.filter((m) => !allowed.has(m.email))
if (strangers.length > 0) {
  die(
    `The school has ${strangers.length} member(s) who are not allowlisted.`,
    'Refusing to delete a school someone else also belongs to.',
  )
}

// --- gather everything, storage paths included -------------------------------

const memberIds = ids(members)

const { data: apps } = await db
  .from('applications').select('id, photo_path').eq('school_id', target.school_id)
const { data: templates } = await db
  .from('form_templates').select('id, template_file_path').eq('school_id', target.school_id)
const { data: assignments } = await db
  .from('assignments').select('id').in('student_id', memberIds)
const assignmentIds = ids(assignments)
const { data: submissions } = assignmentIds.length
  ? await db.from('submissions').select('id, generated_pdf_path').in('assignment_id', assignmentIds)
  : { data: [] }
const submissionIds = ids(submissions)
const { data: uploads } = submissionIds.length
  ? await db.from('document_uploads').select('storage_path').in('submission_id', submissionIds)
  : { data: [] }

const documentPaths = [...paths(uploads, 'storage_path'), ...paths(submissions, 'generated_pdf_path')]
const photoPaths = paths(apps, 'photo_path')
const templatePaths = paths(templates, 'template_file_path')

process.stdout.write(
  `\n  Target       ${email} (${target.role}) on ${url}\n` +
    `  School       ${target.school_id} — ${members.length} member(s)\n` +
    `  Applications ${(apps ?? []).length}\n` +
    `  Templates    ${(templates ?? []).length}\n` +
    `  Assignments  ${assignmentIds.length}\n` +
    `  Submissions  ${submissionIds.length}\n` +
    `  Storage      ${documentPaths.length} document(s), ${photoPaths.length} photo(s), ` +
    `${templatePaths.length} template file(s)\n\n`,
)

if (!yes) {
  process.stdout.write('  Nothing deleted. Re-run with --yes to proceed.\n\n')
  process.exit(0)
}

// --- teardown ----------------------------------------------------------------

// Storage BEFORE the DB rows: deleting a storage.objects row via SQL does not
// remove the S3 bytes (only the Storage API does), and once the DB rows are
// gone the paths are lost. Same invariant as lib/retention/erase.ts. Without
// this every reset cycle silently accumulates the previous run's files.
for (const [bucket, list] of [
  ['documents', documentPaths],
  ['application-photos', photoPaths],
  ['form-templates', templatePaths],
]) {
  for (let i = 0; i < list.length; i += 100) {
    const { error } = await db.storage.from(bucket).remove(list.slice(i, i + 100))
    if (error) die(`storage ${bucket}: ${error.message}`)
  }
}

// FK-derived order. Each step clears a NO ACTION reference the next one needs
// gone; everything not named here is CASCADE or SET NULL.
if ((apps ?? []).length) {
  must('applications')(await db.from('applications').delete().eq('school_id', target.school_id))
}
if (submissionIds.length) {
  must('submissions')(await db.from('submissions').delete().in('id', submissionIds))
}
if (assignmentIds.length) {
  must('assignments')(await db.from('assignments').delete().in('id', assignmentIds))
}
must('form_templates')(await db.from('form_templates').delete().eq('school_id', target.school_id))
must('exchanges a')(await db.from('exchanges').delete().eq('school_a_id', target.school_id))
must('exchanges b')(await db.from('exchanges').delete().eq('school_b_id', target.school_id))
must('organizer_invites')(await db.from('organizer_invites').delete().eq('school_id', target.school_id))
must('users')(await db.from('users').delete().eq('school_id', target.school_id))
must('schools')(await db.from('schools').delete().eq('id', target.school_id))

// So the next cycle starts clean: a leftover waitlist row is harmless but
// misleading when reading the table.
must('signup_waitlist')(await db.from('signup_waitlist').delete().in('email', members.map((m) => m.email)))

for (const m of members) {
  const { error } = await withAuthAdminRetry(
    () => db.auth.admin.deleteUser(m.id),
    'deleteUser',
  )
  if (error) die(`auth delete failed: ${error.message ?? error.code ?? 'unknown'}`)
}

process.stdout.write(`  ✓ ${email} and ${members.length} account(s) removed. Sign up again at /signup.\n\n`)
