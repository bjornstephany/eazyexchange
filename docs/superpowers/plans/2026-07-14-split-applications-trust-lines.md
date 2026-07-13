# Split `actions/applications.ts` Along Trust Lines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 628-line `actions/applications.ts` (three trust models in one module) into `actions/apply.ts` (anonymous resume-token funnel), `actions/applications-review.ts` (authenticated organizer review), and `actions/invitations.ts` (anonymous invite-token response), moving two genuinely-shared helpers to existing lib modules — a pure, behavior-neutral refactor with **zero** runtime change.

**Architecture:** A file move along trust lines. `git mv actions/applications.ts actions/apply.ts` preserves the funnel's git history (apply retains ~54% of the original, above git's 50% rename threshold); the organizer-review and invitation sections are cut into two new files, bodies and comments verbatim. Only import lists, two shared-helper references, and one identifier rename (`PHOTO_BUCKET` → `APPLICATION_PHOTO_BUCKET`) differ inside any moved code. All 25 import/mock sites, the admin-client allowlist, and two docs are updated in the **same single commit** on a feature branch. No re-export shim.

**Tech Stack:** Next.js App Router Server Actions (`'use server'`), TypeScript, Supabase (admin + anon + session clients), Vitest.

## Global Constraints

- **Behavior-neutral, single commit.** Every existing test must pass with **only** import-specifier and `vi.mock` path edits — no test body, assertion, or mock-factory-content change. No new features, no policy/signature/migration/RLS/storage change. (Spec §Scope guard.)
- **`'use server'` rules.** Each of the three action files starts with `'use server'` as its first statement; every runtime export is an async function. The only non-function export is `export type StartApplicationResult` (type-only, erased before Next's export validation). Constants and private helpers stay unexported — that is why the two shared helpers move to lib modules (which are not `'use server'` files and may export non-async values).
- **French copy:** none in these files (all user-facing strings here are English). No accent/apostrophe hazards apply to this refactor.
- **PII:** never log or commit student/parent PII. Stage every file **by name** (`git add <path> …`); `git add -A` / `git add .` are forbidden. Do not stage the untracked `docs/exampleSchoolFiles/` directory.
- **Autonomy stops at the PR.** No push, merge, prod migration, edge-function deploy, Vercel config change, or email send. Work on branch `refactor/split-applications-trust-lines`.
- **Do NOT touch** `components/landing/**` (owned by the in-flight landingnav-focus-management item) or PR #11's files (`lib/__tests__/email-french-copy.test.ts`, `lib/landing/__tests__/content.test.ts`, `supabase/functions/send-reminders/*`). None appear in this plan; keep it that way.
- **Orchestrator-owned references stay as-is:** the old-path mentions in `.claude/skills/autopilot/SKILL.md`, `docs/autopilot/status.md`, and `BACKLOG.md` are historical/queue text — do not edit them.

## Task boundaries — why this lands as ONE commit (read first)

This is an atomic refactor: because there is **no re-export shim** (spec decision #2) and the file is deleted via rename, the working tree only type-checks and tests-green **as a whole** — any intermediate state has dangling `@/actions/applications` imports. The spec's Git mechanics (§Git mechanics, decision #4) mandate a **single commit**. Therefore the three tasks below are **review checkpoints, not commit points**: Tasks 1 and 2 create/edit files but do **not** commit; Task 3 runs the full verification gate and performs the one `git add <by name>` + commit. This is a deliberate departure from per-task commits, justified by the single-commit spec mandate and the whole-tree-green-only nature of a shim-less split.

Do the tasks strictly in order (1 → 2 → 3).

---

## Task 0: Create the feature branch

**Files:** none (git branch only)

- [ ] **Step 1: Confirm you are on `main` with a clean-enough tree**

Run: `git branch --show-current`
Expected: `main`

Run: `git status --short`
Expected: at most `?? docs/exampleSchoolFiles/` (pre-existing untracked; leave it). If anything else is staged/modified, STOP and flag.

- [ ] **Step 2: Create and switch to the feature branch**

```bash
git switch -c refactor/split-applications-trust-lines
```

Run: `git branch --show-current`
Expected: `refactor/split-applications-trust-lines`

---

## Task 1: Add shared helpers, then split the module into three files

**Files:**
- Modify: `lib/tokens.ts` (add exported `tokenExpired`)
- Modify: `lib/uploads.ts` (add exported `APPLICATION_PHOTO_BUCKET`)
- Rename+rewrite: `actions/applications.ts` → `actions/apply.ts` (via `git mv`, then overwrite contents)
- Create: `actions/applications-review.ts`
- Create: `actions/invitations.ts`
- Delete: `actions/applications.ts` (the rename)

**Interfaces:**
- Produces (consumed by later tasks and by the three action files):
  - `lib/tokens.ts`: `export function tokenExpired(expiresAt: string | null): boolean`
  - `lib/uploads.ts`: `export const APPLICATION_PHOTO_BUCKET = 'application-photos'`
  - `actions/apply.ts` exports: `type StartApplicationResult`, `startApplication`, `getApplicationDraft`, `peekApplicationDraft`, `sendApplicationResumeLink`, `saveApplicationDraft`, `submitApplication`, `uploadApplicationPhoto`
  - `actions/applications-review.ts` exports: `listApplications`, `getApplicationForReview`, `acceptApplication`, `rejectApplication`, `acceptApplications`, `rejectApplications`
  - `actions/invitations.ts` exports: `getInvitation`, `respondToInvitation`

### Step 1: Add `tokenExpired` to `lib/tokens.ts`

- [ ] Append these lines to the end of `lib/tokens.ts` (verbatim body from the original file plus the one-line comment the spec requires):

```ts

// Shared expiry check for resume/invite token links.
export function tokenExpired(expiresAt: string | null): boolean {
  return expiresAt != null && new Date(expiresAt).getTime() < Date.now()
}
```

### Step 2: Add `APPLICATION_PHOTO_BUCKET` to `lib/uploads.ts`

- [ ] Append these lines to the end of `lib/uploads.ts`:

```ts

// Private bucket for applicant photos (see migration
// 20260629000002_application_photos_bucket.sql).
export const APPLICATION_PHOTO_BUCKET = 'application-photos'
```

### Step 3: Rename the module to `apply.ts` (preserves funnel history)

- [ ] Run:

```bash
git mv actions/applications.ts actions/apply.ts
```

Run: `git status --short actions/`
Expected: `R  actions/applications.ts -> actions/apply.ts`

### Step 4: Overwrite `actions/apply.ts` with the funnel-only contents

- [ ] Replace the **entire** contents of `actions/apply.ts` with exactly this. Every function body below is byte-for-byte from the original module; only the import block, the removed `PHOTO_BUCKET`/`tokenExpired`/`INVITE_WINDOW_MS` lines, and the two `.from(APPLICATION_PHOTO_BUCKET)` identifier renames differ.

```ts
'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAnonClient } from '@/lib/supabase/anon'
import { randomToken, tokenExpired } from '@/lib/tokens'
import { normalizeEmail, isValidEmail, hasOverlongAnswer, MAX_ANSWER_LENGTH } from '@/lib/validation'
import { missingRequiredApplication, applicantName as buildApplicantName } from '@/lib/application-form'
import { validateUploadFile, APPLICATION_PHOTO_BUCKET } from '@/lib/uploads'
import { enforceRateLimit, enforceRateLimitStrict, clientIp } from '@/lib/rate-limit'
import {
  sendApplicationResumeEmail, sendApplicationConfirmationEmail, sendNewApplicationAlertEmail,
} from '@/lib/email'
import { assertExchangeWritable } from '@/lib/exchange-guard'
import { getAppUrl } from '@/lib/app-url'

const APP_URL = getAppUrl()

function applicationsClosed(exchange: { application_open: boolean; application_deadline: string | null }): boolean {
  if (!exchange.application_open) return true
  if (exchange.application_deadline) {
    const today = new Date().toISOString().slice(0, 10)
    if (today > exchange.application_deadline) return true
  }
  return false
}

const RESUME_FALLBACK_MS = 30 * 24 * 60 * 60 * 1000

// When a resume link should die: end of the deadline day (the day after, 00:00
// UTC — the moment applicationsClosed flips), or 30 days out if no deadline.
function resumeExpiry(deadline: string | null): string {
  if (deadline) return new Date(new Date(`${deadline}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000).toISOString()
  return new Date(Date.now() + RESUME_FALLBACK_MS).toISOString()
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
  const { error: upErr } = await admin.storage.from(APPLICATION_PHOTO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (upErr) throw upErr
  const { error } = await admin.from('applications').update({ photo_path: path }).eq('id', app.id)
  if (error) throw error
  return { path }
}
```

### Step 5: Create `actions/applications-review.ts`

- [ ] Create `actions/applications-review.ts` with exactly this content (bodies + section comments verbatim from the original organizer/bulk sections; only imports, the `APP_URL`/`INVITE_WINDOW_MS` constants block, and the `.from(APPLICATION_PHOTO_BUCKET)` rename differ):

```ts
'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser, requireOrganizer } from '@/lib/auth/require'
import { randomToken } from '@/lib/tokens'
import { applicantName as buildApplicantName } from '@/lib/application-form'
import { APPLICATION_PHOTO_BUCKET } from '@/lib/uploads'
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
    const { data } = await admin.storage.from(APPLICATION_PHOTO_BUCKET)
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
  revalidatePath('/exchanges')
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
  revalidatePath('/exchanges')
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
```

### Step 6: Create `actions/invitations.ts`

- [ ] Create `actions/invitations.ts` with exactly this content (bodies + section comment verbatim from the original invitation section; only imports and the `APP_URL` constant differ). **Keep the trailing "No revalidatePath … would be inert" comment verbatim** — do not add `revalidatePath`:

```ts
'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applicantName as buildApplicantName } from '@/lib/application-form'
import { assertExchangeWritable } from '@/lib/exchange-guard'
import { getAppUrl } from '@/lib/app-url'
import { tokenExpired } from '@/lib/tokens'

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
```

### Step 7: Checkpoint — verify the rename + moved-code diff (do NOT commit)

- [ ] Stage the three action files + two lib files by name so rename detection can run:

```bash
git add actions/apply.ts actions/applications-review.ts actions/invitations.ts lib/tokens.ts lib/uploads.ts
```

- [ ] Confirm git sees `apply.ts` as a rename of `applications.ts`:

Run: `git diff --cached -M --stat -- actions/`
Expected: a line of the form `actions/{applications.ts => apply.ts}` (rename), plus `actions/applications-review.ts` and `actions/invitations.ts` as new files.

- [ ] Review the moved bodies are pure moves:

Run: `git diff --cached -M --color-moved=dimmed-zebra`
Expected: inside every moved function body, the only non-moved (added/removed) lines are import lines, the `PHOTO_BUCKET`→`APPLICATION_PHOTO_BUCKET` identifier on the two `.from(...)` calls, and the removed/relocated `const PHOTO_BUCKET`, `tokenExpired`, `INVITE_WINDOW_MS` declarations. If any function's logic lines show as changed, STOP and fix the transcription.

Do **not** commit yet — the tree still has dangling `@/actions/applications` imports until Task 2.

---

## Task 2: Update all import/mock sites, the allowlist, and the docs

**Files (25 code sites + allowlist + 2 docs):**
- Modify: `app/(organizer)/applications/page.tsx`, `app/(organizer)/dashboard/page.tsx`, `app/(organizer)/exchanges/page.tsx`, `app/apply/resume/[token]/page.tsx`, `app/invite/[token]/page.tsx`
- Modify: `components/ApplicationForm.tsx`, `components/ApplicationPhotoUpload.tsx`, `components/ApplicationReviewActions.tsx`, `components/ApplicationStartForm.tsx`, `components/ApplyEntry.tsx`, `components/InviteResponseForm.tsx`, `components/applications/CandidaturesView.tsx`, `components/dashboard/StudentDrawer.tsx`
- Modify: `actions/__tests__/applications.test.ts`, `actions/__tests__/audit-instrumentation.test.ts`, `actions/__tests__/bulk-applications.test.ts`, `actions/__tests__/list-applications.test.ts`
- Modify: `components/__tests__/ApplicationForm.test.tsx`, `components/__tests__/ApplicationPhotoUpload.test.tsx`, `components/__tests__/ApplicationStartForm.test.tsx`, `components/__tests__/ApplyEntry.test.tsx`, `components/__tests__/InviteResponseForm.test.tsx`, `components/applications/__tests__/CandidaturesView.test.tsx`, `components/dashboard/__tests__/OverviewView.test.tsx`, `components/dashboard/__tests__/StudentDrawer.test.tsx`
- Modify: `lib/supabase/__tests__/admin-allowlist.test.ts`
- Modify: `CLAUDE.md`, `docs/security/service-role-callsites.md`

**Interfaces:**
- Consumes: the exports produced by Task 1 (the three action modules + two lib helpers).

Each edit below is a single-line find→replace unless noted. Apply them exactly.

### Step 1: App pages (5)

- [ ] `app/invite/[token]/page.tsx` — replace
  `import { getInvitation } from '@/actions/applications'`
  with `import { getInvitation } from '@/actions/invitations'`
- [ ] `app/apply/resume/[token]/page.tsx` — replace
  `import { getApplicationDraft } from '@/actions/applications'`
  with `import { getApplicationDraft } from '@/actions/apply'`
- [ ] `app/(organizer)/exchanges/page.tsx` — replace
  `import { listApplications } from '@/actions/applications'`
  with `import { listApplications } from '@/actions/applications-review'`
- [ ] `app/(organizer)/dashboard/page.tsx` — replace
  `import { listApplications } from '@/actions/applications'`
  with `import { listApplications } from '@/actions/applications-review'`
- [ ] `app/(organizer)/applications/page.tsx` — replace
  `import { listApplications, getApplicationForReview } from '@/actions/applications'`
  with `import { listApplications, getApplicationForReview } from '@/actions/applications-review'`

### Step 2: Components (8)

- [ ] `components/InviteResponseForm.tsx` — replace
  `import { respondToInvitation } from '@/actions/applications'`
  with `import { respondToInvitation } from '@/actions/invitations'`
- [ ] `components/ApplicationPhotoUpload.tsx` — replace
  `import { uploadApplicationPhoto } from '@/actions/applications'`
  with `import { uploadApplicationPhoto } from '@/actions/apply'`
- [ ] `components/ApplicationStartForm.tsx` — replace
  `import { startApplication } from '@/actions/applications'`
  with `import { startApplication } from '@/actions/apply'`
- [ ] `components/ApplicationReviewActions.tsx` — replace
  `import { acceptApplication, rejectApplication } from '@/actions/applications'`
  with `import { acceptApplication, rejectApplication } from '@/actions/applications-review'`
- [ ] `components/ApplyEntry.tsx` — replace
  `import { peekApplicationDraft } from '@/actions/applications'`
  with `import { peekApplicationDraft } from '@/actions/apply'`
- [ ] `components/applications/CandidaturesView.tsx` — replace
  `import { acceptApplications, rejectApplications } from '@/actions/applications'`
  with `import { acceptApplications, rejectApplications } from '@/actions/applications-review'`
- [ ] `components/ApplicationForm.tsx` — replace
  `import { saveApplicationDraft, submitApplication, sendApplicationResumeLink } from '@/actions/applications'`
  with `import { saveApplicationDraft, submitApplication, sendApplicationResumeLink } from '@/actions/apply'`
- [ ] `components/dashboard/StudentDrawer.tsx` — replace
  `import { acceptApplication, rejectApplication } from '@/actions/applications'`
  with `import { acceptApplication, rejectApplication } from '@/actions/applications-review'`

### Step 3: Action tests (4) — import paths only, no body changes

- [ ] `actions/__tests__/applications.test.ts` — replace the **one** import line (line ~129)
  `import { startApplication, submitApplication, saveApplicationDraft, respondToInvitation, getApplicationDraft, sendApplicationResumeLink, peekApplicationDraft } from '../applications'`
  with these **two** lines (funnel functions from `../apply`, `respondToInvitation` from `../invitations`):
  ```ts
  import { startApplication, submitApplication, saveApplicationDraft, getApplicationDraft, sendApplicationResumeLink, peekApplicationDraft } from '../apply'
  import { respondToInvitation } from '../invitations'
  ```
  (The file's `vi.mock(...)` calls mock the Supabase clients / `next/*` / `@/lib/email`, **not** `@/actions/applications` — leave them untouched.)
- [ ] `actions/__tests__/audit-instrumentation.test.ts` — replace
  `import { rejectApplication } from '../applications'`
  with `import { rejectApplication } from '../applications-review'`
- [ ] `actions/__tests__/bulk-applications.test.ts` — replace
  `import { acceptApplications, rejectApplications } from '../applications'`
  with `import { acceptApplications, rejectApplications } from '../applications-review'`
- [ ] `actions/__tests__/list-applications.test.ts` — replace
  `import { listApplications } from '../applications'`
  with `import { listApplications } from '../applications-review'`

### Step 4: Component tests (8) — mock + import paths only, no factory/body changes

- [ ] `components/__tests__/ApplicationForm.test.tsx` — change **both** occurrences of the path `@/actions/applications` to `@/actions/apply`:
  - the `vi.mock('@/actions/applications', () => ({` line → `vi.mock('@/actions/apply', () => ({`
  - the `import { sendApplicationResumeLink, submitApplication } from '@/actions/applications'` line → `… from '@/actions/apply'`
- [ ] `components/__tests__/ApplicationPhotoUpload.test.tsx` — change both `@/actions/applications` → `@/actions/apply`:
  - `vi.mock('@/actions/applications', () => ({` → `vi.mock('@/actions/apply', () => ({`
  - `import { uploadApplicationPhoto } from '@/actions/applications'` → `… from '@/actions/apply'`
- [ ] `components/__tests__/ApplicationStartForm.test.tsx` — change both `@/actions/applications` → `@/actions/apply`:
  - `vi.mock('@/actions/applications', () => ({` → `vi.mock('@/actions/apply', () => ({`
  - `import { startApplication } from '@/actions/applications'` → `… from '@/actions/apply'`
- [ ] `components/__tests__/ApplyEntry.test.tsx` — change both `@/actions/applications` → `@/actions/apply`:
  - `vi.mock('@/actions/applications', () => ({` → `vi.mock('@/actions/apply', () => ({`
  - `import { peekApplicationDraft } from '@/actions/applications'` → `… from '@/actions/apply'`
- [ ] `components/__tests__/InviteResponseForm.test.tsx` — change both `@/actions/applications` → `@/actions/invitations`:
  - `vi.mock('@/actions/applications', () => ({ respondToInvitation: vi.fn(async () => {}) }))` → `vi.mock('@/actions/invitations', () => ({ respondToInvitation: vi.fn(async () => {}) }))`
  - `import { respondToInvitation } from '@/actions/applications'` → `… from '@/actions/invitations'`
- [ ] `components/applications/__tests__/CandidaturesView.test.tsx` — replace the single mock line
  `vi.mock('@/actions/applications', () => ({` with `vi.mock('@/actions/applications-review', () => ({`
- [ ] `components/dashboard/__tests__/StudentDrawer.test.tsx` — replace the single mock line
  `vi.mock('@/actions/applications', () => ({` with `vi.mock('@/actions/applications-review', () => ({`
- [ ] `components/dashboard/__tests__/OverviewView.test.tsx` — replace the single mock line
  `vi.mock('@/actions/applications', () => ({ acceptApplication: vi.fn(), rejectApplication: vi.fn() }))`
  with `vi.mock('@/actions/applications-review', () => ({ acceptApplication: vi.fn(), rejectApplication: vi.fn() }))`
  (OverviewView renders StudentDrawer, which imports the accept/reject actions.)

### Step 5: Admin-client allowlist

- [ ] `lib/supabase/__tests__/admin-allowlist.test.ts` — in the `ALLOWLIST` array, replace the single line
  `  'actions/applications.ts',`
  with these three lines (all three new files import `lib/supabase/admin`; the array is `.sort()`ed so order is cosmetic — keep alphabetical):
  ```ts
    'actions/apply.ts',
    'actions/applications-review.ts',
    'actions/invitations.ts',
  ```

### Step 6: `CLAUDE.md` — retire the tripwire, add the convention note

- [ ] Replace the whole tripwire bullet (line ~135), currently:
  `- **Tripwire — \`actions/applications.ts\`:** the next feature that touches it must FIRST split it along trust lines (\`actions/apply.ts\` public-token flow, \`actions/applications-review.ts\` organizer, \`actions/invitations.ts\`) before adding behavior. It mixes three trust models and is the churn leader.`
  with:
  `- **Application server actions are split by trust model** — \`actions/apply.ts\` (anonymous resume-token funnel), \`actions/applications-review.ts\` (authenticated organizer review), \`actions/invitations.ts\` (anonymous invite-token response). New application behavior goes in the file matching its trust model; never re-merge them.`

  **Conflict note:** PR #10 also edits `CLAUDE.md`; whichever merges second takes a trivial rebase (the loop's merge-commit-only rule covers this). Do not resolve it here — this stage stops at the PR.

### Step 7: `docs/security/service-role-callsites.md` — path substitution in the 6 cited rows

- [ ] Replace the row (line ~24)
  `| \`actions/applications.ts\` startApplication / saveApplicationDraft / submitApplication / uploadApplicationPhoto / respondToInvitation | a | token is the only auth; multi-table writes + auth.admin + storage |`
  with these **two** rows (funnel → `apply.ts`; `respondToInvitation` gets its own row under `invitations.ts`; justification text unchanged on both):
  ```
  | `actions/apply.ts` startApplication / saveApplicationDraft / submitApplication / uploadApplicationPhoto | a | token is the only auth; multi-table writes + auth.admin + storage |
  | `actions/invitations.ts` respondToInvitation | a | token is the only auth; multi-table writes + auth.admin + storage |
  ```
- [ ] Replace `| \`actions/applications.ts\` sendApplicationResumeLink |` → `| \`actions/apply.ts\` sendApplicationResumeLink |` (rest of row unchanged).
- [ ] Replace `| \`actions/applications.ts\` getApplicationDraft |` → `| \`actions/apply.ts\` getApplicationDraft |` (rest unchanged).
- [ ] Replace `| \`actions/applications.ts\` getInvitation |` → `| \`actions/invitations.ts\` getInvitation |` (rest unchanged).
- [ ] Replace `| \`actions/applications.ts\` getApplicationForReview |` → `| \`actions/applications-review.ts\` getApplicationForReview |` (rest unchanged).
- [ ] Replace `| \`actions/applications.ts\` peekApplicationDraft |` → `| \`actions/apply.ts\` peekApplicationDraft |` (rest unchanged).

### Step 8: Checkpoint — grep + test-diff audit (do NOT commit)

- [ ] Stale-import grep gate (both must return **nothing**):

```bash
grep -rn "actions/applications'" --include='*.ts' --include='*.tsx' app actions components lib
grep -rn "\.\./applications'" actions
```
Expected: no output from either.

- [ ] The old file is gone:

Run: `test ! -f actions/applications.ts && echo GONE`
Expected: `GONE`

- [ ] Test-diff audit — confirm `__tests__` changes are import/mock paths only:

Run: `git diff -- '*/__tests__/*' 'actions/__tests__/*'`
Expected: every changed line is an `import … from '…'` specifier or a `vi.mock('…', …)` path string. Zero assertion, mock-factory-body, or test-logic changes. If anything else changed, STOP and revert that hunk.

---

## Task 3: Verify green and commit (the single commit)

**Files:** none new — this task runs the gate and commits everything staged/edited in Tasks 1–2.

### Step 1: Lint

- [ ] Run: `pnpm lint`
Expected: no errors (warnings pre-existing elsewhere are fine; no new errors in the touched files).

### Step 2: Tests

- [ ] Run: `pnpm test`
Expected: full suite green. In particular these must pass unchanged in behavior:
`actions/__tests__/applications.test.ts`, `actions/__tests__/audit-instrumentation.test.ts`, `actions/__tests__/bulk-applications.test.ts`, `actions/__tests__/list-applications.test.ts`, `lib/supabase/__tests__/admin-allowlist.test.ts`, and the 8 component tests listed in Task 2 Step 4.

### Step 3: Type-check / build

- [ ] Run: `pnpm build`
Expected: success. **Known local limitation:** if the placeholder `.env.local` blocks `pnpm build` (Supabase URL/keys are placeholders), instead run `npx tsc --noEmit` and note in the report that build was substituted by tsc for this reason.
Expected (tsc): no type errors.

> `pnpm test:rls` is **not** required: no migration, RLS policy, or storage-bucket change. The allowlist edit is a unit test, already covered by `pnpm test`.

### Step 4: Final stage-by-name + single commit

- [ ] Stage every touched file **by name** (no `git add -A`/`.`). The three action files + two lib files were staged in Task 1 Step 7; stage the rest now:

```bash
git add \
  actions/apply.ts actions/applications-review.ts actions/invitations.ts \
  lib/tokens.ts lib/uploads.ts \
  lib/supabase/__tests__/admin-allowlist.test.ts \
  app/\(organizer\)/applications/page.tsx \
  app/\(organizer\)/dashboard/page.tsx \
  app/\(organizer\)/exchanges/page.tsx \
  app/apply/resume/\[token\]/page.tsx \
  app/invite/\[token\]/page.tsx \
  components/ApplicationForm.tsx \
  components/ApplicationPhotoUpload.tsx \
  components/ApplicationReviewActions.tsx \
  components/ApplicationStartForm.tsx \
  components/ApplyEntry.tsx \
  components/InviteResponseForm.tsx \
  components/applications/CandidaturesView.tsx \
  components/dashboard/StudentDrawer.tsx \
  actions/__tests__/applications.test.ts \
  actions/__tests__/audit-instrumentation.test.ts \
  actions/__tests__/bulk-applications.test.ts \
  actions/__tests__/list-applications.test.ts \
  components/__tests__/ApplicationForm.test.tsx \
  components/__tests__/ApplicationPhotoUpload.test.tsx \
  components/__tests__/ApplicationStartForm.test.tsx \
  components/__tests__/ApplyEntry.test.tsx \
  components/__tests__/InviteResponseForm.test.tsx \
  components/applications/__tests__/CandidaturesView.test.tsx \
  components/dashboard/__tests__/OverviewView.test.tsx \
  components/dashboard/__tests__/StudentDrawer.test.tsx \
  CLAUDE.md \
  docs/security/service-role-callsites.md
```

- [ ] Confirm the staged set is exactly the intended files and that `docs/exampleSchoolFiles/` is NOT staged:

Run: `git status --short`
Expected: staged changes for the files above (including the `R actions/applications.ts -> actions/apply.ts` rename); `?? docs/exampleSchoolFiles/` remains untracked.

- [ ] Confirm no PII / stray files snuck in:

Run: `git diff --cached --stat`
Expected: only the files listed above. No `.pdf`, no `docs/exampleSchoolFiles/*`, no `components/landing/**`, no PR #11 files.

- [ ] Commit (single commit):

```bash
git commit -m "refactor: split actions/applications.ts along trust lines (apply/review/invitations)

Pure behavior-neutral split of the 628-line applications module into
actions/apply.ts (anonymous resume-token funnel), actions/applications-review.ts
(organizer review) and actions/invitations.ts (invite-token response). Shared
helpers move to lib/tokens.ts (tokenExpired) and lib/uploads.ts
(APPLICATION_PHOTO_BUCKET). All import/mock sites, the admin-client allowlist,
CLAUDE.md (tripwire retired) and docs/security/service-role-callsites.md updated
in the same commit. No re-export shim. No runtime change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] Confirm the rename was recorded (history follows the funnel):

Run: `git show --stat --oneline -M HEAD | head -40`
Expected: `actions/applications.ts => actions/apply.ts` shown as a rename; the two new files and all edited files present.

---

## Behavior-neutrality verification summary (all gates are steps above)

1. Moved-code review — Task 1 Step 7 (`git diff --cached -M --color-moved=dimmed-zebra`).
2. Test-diff audit (import/mock strings only) — Task 2 Step 8.
3. `pnpm lint` / `pnpm test` / `pnpm build` (tsc fallback) — Task 3 Steps 1–3.
4. Stale-import grep gate + old file gone — Task 2 Step 8.
5. Single stage-by-name commit, no PII, rename recorded — Task 3 Step 4.

## Out of scope (flagged in the spec — do NOT implement here)

- Narrowing `assertOrganizerOwnsApplication`'s `select('*')` (returns `resume_token`/`invite_token` server-side; not currently serialized to the browser).
- Documenting/testing `acceptApplication`'s `rejected → accepted` un-reject path.

Both are separate backlog candidates; this refactor changes **no behavior**.
```
