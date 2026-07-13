# Split `actions/applications.ts` along trust lines — design spec

**Date:** 2026-07-14
**Item:** split-applications-trust-lines (the standing CLAUDE.md tripwire)
**Scope guard:** pure, behavior-neutral refactor. A file move along trust lines —
**zero** behavior changes, no new features, no policy changes, no signature
changes, no migration, no RLS/storage change. Every existing test must pass with
**only import/mock-path edits**; no test body changes.

## Why

`actions/applications.ts` (629 lines) mixes three trust models in one module:

1. **Anonymous public-token funnel** — caller's only credential is a
   `resume_token` from their own localStorage/email; runs on the service-role
   client behind rate limits.
2. **Organizer review** — authenticated, `requireOrganizer()`, RLS-scoped session
   client (plus one admin signed-URL call).
3. **Public invitation response** — anonymous, keyed by `invite_token`; performs
   account provisioning via `auth.admin`.

CLAUDE.md's tripwire mandates splitting before the next feature touches it. This
item does the split proactively.

## Current export inventory (verified 2026-07-14, all call sites mapped)

| Export | Trust model | Auth mechanism |
|---|---|---|
| `StartApplicationResult` (type) | public token | — |
| `startApplication` | public token | rate limits (IP + email), admin client |
| `getApplicationDraft` | public token | `resume_token`, admin client |
| `peekApplicationDraft` | public token | `resume_token`, **anon** client RPC |
| `sendApplicationResumeLink` | public token | `resume_token`, rate limits, admin client |
| `saveApplicationDraft` | public token | `resume_token`, admin client |
| `submitApplication` | public token | `resume_token`, admin client |
| `uploadApplicationPhoto` | public token | `resume_token`, admin client + storage |
| `listApplications` | organizer | `requireOrganizer`, session client |
| `getApplicationForReview` | organizer | `requireUser` + ownership assert, session client + admin (signed URL only) |
| `acceptApplication` | organizer | `requireUser` + ownership assert, session client, `logAudit` |
| `rejectApplication` | organizer | same, `logAudit` |
| `acceptApplications` / `rejectApplications` (bulk) | organizer | loop over the single-item actions |
| `getInvitation` | public invite token | `invite_token`, admin client |
| `respondToInvitation` | public invite token | `invite_token`, admin client + `auth.admin` provisioning |

Private helpers: `applicationsClosed`, `resumeExpiry`, `tokenExpired`,
`assertOrganizerOwnsApplication`; constants `APP_URL`, `PHOTO_BUCKET`,
`RESUME_FALLBACK_MS`, `INVITE_WINDOW_MS`, `APPLICATION_CAP_PER_EXCHANGE`.

No other action file imports from `actions/applications.ts` (verified by grep);
the bulk actions call `acceptApplication`/`rejectApplication` within the same
trust group, so the three new files have **no imports between each other**.

## Target layout

### `actions/apply.ts` — public resume-token funnel (`'use server'`)

Exports (bodies moved verbatim): `startApplication` (+ `export type
StartApplicationResult`), `getApplicationDraft`, `peekApplicationDraft`,
`sendApplicationResumeLink`, `saveApplicationDraft`, `submitApplication`,
`uploadApplicationPhoto`.

Keeps privately (moved verbatim, incl. comments): `applicationsClosed`,
`resumeExpiry`, `RESUME_FALLBACK_MS`, `APPLICATION_CAP_PER_EXCHANGE` (and its
"not exported because 'use server'" comment), `const APP_URL = getAppUrl()`.

Imports: `createAdminClient`, `createAnonClient`, `randomToken`,
`normalizeEmail`/`isValidEmail`/`hasOverlongAnswer`/`MAX_ANSWER_LENGTH`,
`missingRequiredApplication`/`applicantName as buildApplicantName`,
`validateUploadFile`, `enforceRateLimit`/`enforceRateLimitStrict`/`clientIp`,
`sendApplicationResumeEmail`/`sendApplicationConfirmationEmail`/`sendNewApplicationAlertEmail`,
`assertExchangeWritable`, `getAppUrl`, plus the two shared helpers below.
(No `createClient`, no `require*`, no `revalidatePath`, no `logAudit` — the
funnel never used them.)

### `actions/applications-review.ts` — organizer review (`'use server'`)

Exports: `listApplications`, `getApplicationForReview`, `acceptApplication`,
`rejectApplication`, `acceptApplications`, `rejectApplications`.

Keeps privately: `assertOrganizerOwnsApplication`, `INVITE_WINDOW_MS`,
`const APP_URL = getAppUrl()`.

Imports: `createClient` (server), `createAdminClient` (signed URL in
`getApplicationForReview` only), `requireUser`/`requireOrganizer`, `randomToken`,
`applicantName as buildApplicantName`, `sendInvitationEmail`/`sendApplicationRejectionEmail`,
`revalidatePath`, `assertExchangeWritable`, `getAppUrl`, `logAudit`,
`type SupabaseClient` / `type Database`, plus the shared bucket constant.
(Does **not** need `tokenExpired`.)

### `actions/invitations.ts` — public invite-token response (`'use server'`)

Exports: `getInvitation`, `respondToInvitation`.

Keeps privately: `const APP_URL = getAppUrl()`.

Imports: `createAdminClient`, `applicantName as buildApplicantName`,
`assertExchangeWritable`, `getAppUrl`, `tokenExpired`. (Deliberately no
`revalidatePath` — preserve the existing "revalidation here would be inert"
comment verbatim.)

### Shared helpers (genuinely shared → existing lib modules, not a new file)

1. **`tokenExpired`** → move to `lib/tokens.ts` as an exported function
   (verbatim body + a one-line comment: shared expiry check for
   resume/invite token links). Used by `apply.ts` and `invitations.ts`.
   `lib/tokens.ts` is already the token utility module and is not a
   `'use server'` file, so a non-async export is legal there.
2. **`PHOTO_BUCKET`** → move to `lib/uploads.ts` as
   `export const APPLICATION_PHOTO_BUCKET = 'application-photos'` (with a
   comment pointing at migration `20260629000002_application_photos_bucket.sql`).
   Used by `apply.ts` and `applications-review.ts`; usages reference the
   imported name directly (no local re-alias). `lib/uploads.ts` already serves
   the photo flow (`uploadApplicationPhoto` calls `validateUploadFile`).

No new shared module is created: only two symbols are genuinely shared and both
have natural existing homes.

## No re-export shim

`actions/applications.ts` is **deleted** (via rename — see Git mechanics) and all
import sites updated. Rationale: a shim keeps the tripwire file alive as a
mixing point and hides the trust boundary from readers; only 26 files reference
the module (22 via `@/actions/applications`, 4 action tests via
`'../applications'`) and all are mechanical one-line edits; nothing external (RSC
references are per-function at build time) depends on the module path.

## Import-site updates (complete)

App pages:

| File | New import path |
|---|---|
| `app/(organizer)/applications/page.tsx` (`listApplications`, `getApplicationForReview`) | `@/actions/applications-review` |
| `app/(organizer)/dashboard/page.tsx` (`listApplications`) | `@/actions/applications-review` |
| `app/(organizer)/exchanges/page.tsx` (`listApplications`) | `@/actions/applications-review` |
| `app/apply/resume/[token]/page.tsx` (`getApplicationDraft`) | `@/actions/apply` |
| `app/invite/[token]/page.tsx` (`getInvitation`) | `@/actions/invitations` |

Components:

| File | New import path |
|---|---|
| `components/ApplicationStartForm.tsx` (`startApplication`) | `@/actions/apply` |
| `components/ApplyEntry.tsx` (`peekApplicationDraft`) | `@/actions/apply` |
| `components/ApplicationForm.tsx` (`saveApplicationDraft`, `submitApplication`, `sendApplicationResumeLink`) | `@/actions/apply` |
| `components/ApplicationPhotoUpload.tsx` (`uploadApplicationPhoto`) | `@/actions/apply` |
| `components/ApplicationReviewActions.tsx` (`acceptApplication`, `rejectApplication`) | `@/actions/applications-review` |
| `components/dashboard/StudentDrawer.tsx` (`acceptApplication`, `rejectApplication`) | `@/actions/applications-review` |
| `components/applications/CandidaturesView.tsx` (`acceptApplications`, `rejectApplications`) | `@/actions/applications-review` |
| `components/InviteResponseForm.tsx` (`respondToInvitation`) | `@/actions/invitations` |

Tests — imports and/or `vi.mock('@/actions/applications', …)` paths only; **no
mock factory contents, assertions, or test bodies change**:

| File | Change |
|---|---|
| `actions/__tests__/applications.test.ts` | split the one import line: funnel functions from `'../apply'`, `respondToInvitation` from `'../invitations'` |
| `actions/__tests__/audit-instrumentation.test.ts` | `'../applications'` → `'../applications-review'` |
| `actions/__tests__/bulk-applications.test.ts` | `'../applications'` → `'../applications-review'` |
| `actions/__tests__/list-applications.test.ts` | `'../applications'` → `'../applications-review'` |
| `components/__tests__/ApplicationForm.test.tsx` | mock + import path → `@/actions/apply` |
| `components/__tests__/ApplicationPhotoUpload.test.tsx` | mock + import path → `@/actions/apply` |
| `components/__tests__/ApplicationStartForm.test.tsx` | mock + import path → `@/actions/apply` |
| `components/__tests__/ApplyEntry.test.tsx` | mock + import path → `@/actions/apply` |
| `components/__tests__/InviteResponseForm.test.tsx` | mock + import path → `@/actions/invitations` |
| `components/applications/__tests__/CandidaturesView.test.tsx` | mock path → `@/actions/applications-review` |
| `components/dashboard/__tests__/StudentDrawer.test.tsx` | mock path → `@/actions/applications-review` |
| `components/dashboard/__tests__/OverviewView.test.tsx` | mock path → `@/actions/applications-review` (it renders StudentDrawer) |

Test files keep their existing names. `actions/__tests__/applications.test.ts`
now covers two modules with one shared mock harness (~128 lines of scaffolding);
splitting it would duplicate the harness for zero coverage gain — accepted
residue, noted for a future cleanup only if the harness diverges.

## Admin-client allowlist (`lib/supabase/__tests__/admin-allowlist.test.ts`)

All three new files import `lib/supabase/admin` (verified: apply = funnel writes,
review = signed photo URL, invitations = provisioning), so in `ALLOWLIST` replace
the single entry `'actions/applications.ts'` with:

```
'actions/applications-review.ts',
'actions/apply.ts',
'actions/invitations.ts',
```

(kept in sorted order; the array is `.sort()`ed anyway). This is a **path
reflection of an already-reviewed importer**, not a widening: the same reviewed
call sites, same justifications, now under three paths. The scanner picks up new
files in `actions/` automatically; no other test-logic change.

## `'use server'` constraints (checked)

- Each new file starts with `'use server'` as the first statement.
- All runtime exports in the three files are async functions. The only
  non-function export, `export type StartApplicationResult`, is type-only
  (erased before Next's export validation — it already exists in today's file
  and builds).
- `APPLICATION_CAP_PER_EXCHANGE` and the other constants stay unexported
  (existing comment already documents why).
- The two shared helpers move to lib modules precisely because `'use server'`
  files cannot export non-async values.

## Git mechanics (history readability)

Single commit on the feature branch (branch name: `refactor/split-applications-trust-lines`):

1. `git mv actions/applications.ts actions/apply.ts`
2. Create `actions/applications-review.ts` and `actions/invitations.ts` by
   **cutting** the organizer and invitation sections out of `apply.ts` (bodies
   and comments verbatim; only import lists and the two shared-helper
   references change).
3. Apply all import-site / test / allowlist / lib / doc edits.
4. Stage **by name** (`git add <each path>`), one commit.

`apply.ts` retains ~54% of the original file (above git's 50% default rename
threshold), so `git log --follow actions/apply.ts` keeps the full history of the
funnel — the file with the most security-sensitive churn. The build stage
verifies rename detection with `git diff --cached -M --stat` (expect
`applications.ts => apply.ts` shown as a rename) before committing.

## Documentation updates (same commit)

- **`CLAUDE.md`** — replace the tripwire bullet (line ~135) with a short
  convention note: application server actions are split by trust model —
  `actions/apply.ts` (anonymous resume-token funnel), `actions/applications-review.ts`
  (authenticated organizer review), `actions/invitations.ts` (anonymous
  invite-token response); new application behavior goes in the file matching its
  trust model, never re-merged. **Conflict warning:** PR #10 also edits
  CLAUDE.md — whichever merges second takes a trivial rebase; the loop's
  merge-commit-only rule already covers this.
- **`docs/security/service-role-callsites.md`** — mechanical path substitution
  in the 6 rows that cite `actions/applications.ts` (rows for
  startApplication/save/submit/upload/respondToInvitation split accordingly:
  funnel rows → `actions/apply.ts`, `respondToInvitation` → its own row under
  `actions/invitations.ts`, `getInvitation` → `actions/invitations.ts`,
  `getApplicationForReview` → `actions/applications-review.ts`,
  `peekApplicationDraft` (migrated row) → `actions/apply.ts`). Justifications
  unchanged.

Not touched: `BACKLOG.md`, `docs/autopilot/status.md`,
`.claude/skills/autopilot/SKILL.md` (orchestrator-owned references to the old
path in historical/queue text stay as-is).

## Behavior-neutrality verification (build-stage gates)

1. `git diff -M --color-moved=dimmed-zebra` review: every moved function body is
   a pure move (only import lines and the `PHOTO_BUCKET` →
   `APPLICATION_PHOTO_BUCKET` identifier differ inside bodies).
2. Test diff audit: changes in `__tests__` files are confined to import
   specifiers and `vi.mock` path strings — zero assertion/body edits.
3. `pnpm lint`, `pnpm test`, `pnpm build` all green (if the local placeholder
   env blocks `pnpm build`, run `npx tsc --noEmit` and note it — known local
   limitation). `pnpm test:rls` not required: no migration, RLS policy, or
   bucket change (allowlist edit is a unit test).
4. Grep gate: both `grep -rn "actions/applications'" --include='*.ts*' app actions components lib`
   and `grep -rn "\.\./applications'" actions` return nothing (no stale
   imports/mocks, absolute or relative), and `actions/applications.ts` no longer
   exists.

## Constraints honored

- Does **not** touch `components/landing/**` (in-flight LandingNav item owns it).
- Does **not** touch PR #11's files (`lib/__tests__/email-french-copy.test.ts`,
  `lib/landing/__tests__/content.test.ts`, `supabase/functions/send-reminders/*`).
- No pushes, merges, prod migrations, edge-function deploys, Vercel config, or
  email sends anywhere in this item.

## Decisions made for you

1. **Export→file mapping** as tabled above; the bulk actions live with the
   single-item organizer actions they wrap (same trust model, keeps side effects
   in one file, no cross-file action imports).
2. **No re-export shim** — all 26 referencing files updated instead (rationale
   above; no hard blocker found).
3. **Shared helpers go to existing lib modules**: `tokenExpired` →
   `lib/tokens.ts`; `PHOTO_BUCKET` → `lib/uploads.ts` as
   `APPLICATION_PHOTO_BUCKET`. Rejected alternatives: duplicating them (drift
   risk on a security-relevant expiry check) and a new `lib/applications-shared.ts`
   (two unrelated symbols don't justify a module).
4. **`git mv` to `apply.ts`** (the largest fragment) so history follows the
   funnel; review/invitations read as new files. Single commit, not a two-commit
   move-then-split (intermediate broken states on the branch buy nothing here).
5. **Test files keep their names and bodies**; only import/mock paths change.
   `applications.test.ts` intentionally imports from two modules rather than
   being split (shared harness).
6. **Allowlist**: one old entry replaced by three new ones in the same change,
   framed as path reflection, not privilege widening.
7. **CLAUDE.md tripwire retired in the same PR** (leaving a stale tripwire that
   commands splitting an already-split file would misdirect future sessions),
   accepting the known PR #10 rebase-conflict risk.
8. **`docs/security/service-role-callsites.md` updated** in the same commit so
   the security inventory never points at a deleted file.
9. **Branch, not main** — multi-file refactor qualifies as "multi-step" under
   the git workflow rules; work happens on
   `refactor/split-applications-trust-lines`, autonomy stops at the PR.

## Flagged (separate backlog candidates — NOT part of this refactor)

- `assertOrganizerOwnsApplication` uses `select('*')`, so `getApplicationForReview`
  returns the full row **including `resume_token` / `invite_token`** to the
  page. Today `ApplicationDetail` (a server component) only forwards scalar
  fields to client components, so the tokens do **not** currently serialize to
  the browser — but `listApplications` deliberately excludes tokens for exactly
  this reason, and one careless prop later the tokens ship. Candidate: narrow
  the select (and type the `application: any` prop) in a follow-up.
- `acceptApplication` permits `rejected → accepted` (un-reject). Looks
  intentional (organizer changes their mind) but is undocumented; candidate:
  one-line comment or explicit test.

## Files

**Created:**
- `actions/apply.ts` (via `git mv` from `actions/applications.ts`)
- `actions/applications-review.ts`
- `actions/invitations.ts`

**Deleted:**
- `actions/applications.ts` (the rename above)

**Edited:**
- `lib/tokens.ts` (add `tokenExpired`)
- `lib/uploads.ts` (add `APPLICATION_PHOTO_BUCKET`)
- `lib/supabase/__tests__/admin-allowlist.test.ts`
- `app/(organizer)/applications/page.tsx`
- `app/(organizer)/dashboard/page.tsx`
- `app/(organizer)/exchanges/page.tsx`
- `app/apply/resume/[token]/page.tsx`
- `app/invite/[token]/page.tsx`
- `components/ApplicationForm.tsx`
- `components/ApplicationPhotoUpload.tsx`
- `components/ApplicationReviewActions.tsx`
- `components/ApplicationStartForm.tsx`
- `components/ApplyEntry.tsx`
- `components/InviteResponseForm.tsx`
- `components/applications/CandidaturesView.tsx`
- `components/dashboard/StudentDrawer.tsx`
- `actions/__tests__/applications.test.ts`
- `actions/__tests__/audit-instrumentation.test.ts`
- `actions/__tests__/bulk-applications.test.ts`
- `actions/__tests__/list-applications.test.ts`
- `components/__tests__/ApplicationForm.test.tsx`
- `components/__tests__/ApplicationPhotoUpload.test.tsx`
- `components/__tests__/ApplicationStartForm.test.tsx`
- `components/__tests__/ApplyEntry.test.tsx`
- `components/__tests__/InviteResponseForm.test.tsx`
- `components/applications/__tests__/CandidaturesView.test.tsx`
- `components/dashboard/__tests__/OverviewView.test.tsx`
- `components/dashboard/__tests__/StudentDrawer.test.tsx`
- `CLAUDE.md`
- `docs/security/service-role-callsites.md`
