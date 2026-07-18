# Applications page fixes — design

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation plan

## Problem

Six organizer-facing issues on the Candidatures (applications) page:

1. The **Native language** table column is not useful and should be removed.
2. A **Gender** column should be shown instead.
3. When a student **declines** an invitation, the organizer must **not** be able to
   click the name and re-accept / re-invite them.
4. When an organizer **rejected** an application, clicking it should let them
   **"change their mind"** and invite the student — with an **optional custom
   message** to the student.
5. On the **All** tab a student's status reads "Declined", but that same student
   also appears under the **Rejected** tab (the two are conflated).
6. Add **Awaiting** and **Declined** filter tabs.

## Status model (unchanged by this work)

```
draft → submitted ──accept──▶ accepted ──student:yes──▶ enrolling → enrolled
                   └─reject──▶ rejected                └─student:no ─▶ declined
                                                        └─student:maybe▶ maybe
```

- `submitted` — awaiting organizer review
- `accepted` — organizer accepted, invitation sent, no student reply yet
- `maybe` — student replied "maybe" (still deciding; invite still open)
- `enrolling` / `enrolled` — student confirmed (yes)
- `rejected` — organizer said no
- `declined` — student said no

No new statuses. No schema change, no migration, no RLS change (`sex` is already
collected on the application form; all statuses already exist). Therefore **no
`test:rls` run** is required for this work.

## Design

### 1. Table columns — `components/applications/CandidaturesView.tsx`

- Remove the **Native language** column: the header cell
  (`tableHeader.nativeLanguage`) and the body cell reading `a.data.native_language`.
- Add a **Gender** column in its place, reading `a.data.sex` (falling back to `—`).
  Same column count and grid template — a straight swap.
- The `native_language` field **stays** on the application form
  (`lib/application-form.ts`) — still collected, just not shown in the dashboard
  table.
- i18n: add `organizer.applications.tableHeader.gender`; retire
  `organizer.applications.tableHeader.nativeLanguage`.

### 2. Tab restructure — `components/applications/CandidaturesView.tsx`

`TabKey` becomes `'all' | 'toreview' | 'awaiting' | 'accepted' | 'rejected' | 'declined'`.
Replace the `ACCEPTED_STATUSES` / `REJECTED_STATUSES` constants with explicit,
non-overlapping membership in `matchesTab`:

| Tab        | Statuses                        |
|------------|---------------------------------|
| all        | (everything)                    |
| toreview   | `submitted`                     |
| awaiting   | `accepted`, `maybe`             |
| accepted   | `enrolling`, `enrolled`         |
| rejected   | `rejected` **only**             |
| declined   | `declined`                      |

- Fixes point 5: `declined` is no longer part of the Rejected tab.
- The status pills already render "Declined" vs "Rejected" distinctly
  (`applicantStatusPill` in `lib/dashboard/rollup.ts`) — only tab membership
  changes here.
- The tab label **"Accepted"** now specifically means *student-confirmed /
  enrolled* (`enrolling`/`enrolled`), distinct from the new **"Awaiting"** tab
  (organizer-accepted, waiting on the student). Label kept as "Accepted" per
  product decision.
- i18n: add `organizer.applications.tabs.awaiting` and
  `organizer.applications.tabs.declined`.

### 3. Detail-page actions — `components/applications/ApplicationDetail.tsx` + `components/ApplicationReviewActions.tsx`

- `ApplicationDetail`: remove the `application.status === 'submitted'` gate so
  `ApplicationReviewActions` **always renders** and self-selects behavior by
  status. (Today the component's non-submitted branches are unreachable.)
- `ApplicationReviewActions` behavior by status:
  - **submitted** → Accept / Reject buttons (unchanged).
  - **rejected** → new **"Change your mind"** control: a button that reveals an
    *optional* message `Textarea` + an "Invite" confirm button, which calls
    `acceptApplication(applicationId, { personalNote })`. Continue to show the
    prior rejection note ("currently rejected").
  - **declined** → read-only locked notice ("This student declined the
    invitation") with **no** accept / reinvite control (point 3, UI side).
  - **accepted / maybe / enrolling / enrolled** → existing read-only status
    notice.
- i18n: add keys for the change-your-mind button, the optional-message
  placeholder/label, and the declined-locked notice, under
  `organizer.applications.review.*`.

### 4. Server action — `actions/applications-review.ts`

- `acceptApplication(applicationId: string, opts?: { personalNote?: string })`.
- Existing status guard (`app.status !== 'submitted' && app.status !== 'rejected'`
  → throw) already **rejects `declined`** — this is the server-side backstop for
  point 3. Keep it.
- Thread `opts?.personalNote` into `sendInvitationEmail({ …, personalNote })`.
- Bulk `acceptApplications(ids)` is unchanged (no note) and continues to call
  `acceptApplication(id)` with no opts.

### 5. Email — `lib/email.ts`

- `sendInvitationEmail` gains an optional `personalNote` field. When present,
  render an escaped, highlighted block (mirroring the rejection email's note
  block), in French. Always escape (`esc`) — email-HTML injection rule.

## Testing

- `matchesTab` (unit): `declined` ∉ rejected; `awaiting` = {accepted, maybe};
  `accepted` = {enrolling, enrolled}; `rejected` = {rejected}.
- `CandidaturesView` (component): Gender column renders `data.sex`; no
  native-language column present.
- `ApplicationReviewActions` (component): `rejected` shows the change-your-mind
  control + optional message; `declined` is locked with no Accept button.
- `acceptApplication` (action): `personalNote` reaches `sendInvitationEmail`;
  `declined` status still throws.
- Gate: `pnpm lint`, `pnpm test`, `pnpm build`. No `pnpm test:rls` (no
  schema/RLS change).

## Out of scope

- Any change to the student-facing application form fields (native language is
  still collected).
- Any change to the enrollment / invitation-response flow (`actions/invitations.ts`).
- Dashboard rollup pills and lifecycle rows (`lib/dashboard/rollup.ts`) — the
  pills already distinguish declined vs rejected.
