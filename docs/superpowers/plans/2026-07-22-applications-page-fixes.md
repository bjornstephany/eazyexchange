# Applications page fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the six approved organizer-facing fixes on the Candidatures page (gender column, non-overlapping tabs, declined-is-terminal, rejected "change your mind" re-invite with an optional message), plus the deferred `getApplicationForReview` column narrowing.

**Architecture:** Three surfaces, no schema change. `CandidaturesView.tsx` owns the table columns and tab membership (pure `matchesTab` predicate). `ApplicationReviewActions.tsx` becomes a status-dispatching component rendered for *every* status (today `ApplicationDetail` only renders it for `submitted`, so its other branches are dead code). `actions/applications-review.ts` gains an optional `personalNote` on the single-item accept path, threaded into `sendGoodNewsEmail`; its existing `ACCEPTABLE_STATUSES` guard is already the server-side backstop that refuses `declined`.

**Tech Stack:** Next.js 14 App Router + Server Actions, React client components, next-intl (5 locales, keys typechecked against `messages/en.json` via `global.d.ts`), Vitest + Testing Library, Supabase JS.

## Global Constraints

- **No migration, no RLS change, no `pnpm test:rls`.** `sex` is already collected on the application form and every status already exists. Do not touch `supabase/migrations/`.
- **The spec says `sendInvitationEmail`; the code actually sends `sendGoodNewsEmail`.** The accept path in `reviewApplications` calls `sendGoodNewsEmail`. Thread the note into *that*. `sendInvitationEmail` is a different, unrelated function.
- **i18n parity is enforced** by `messages/__tests__/parity.test.ts`: every key added or removed must be added/removed in **all five** catalogs — `messages/{fr,en,es,it,de}.json` — with identical key paths.
- **French copy must use the typographic apostrophe `’`, never `'`.** A guard test (`lib/__tests__/email-french-copy.test.ts`) and the project convention enforce this. Applies to every new fr/`.json` string.
- **Always escape user-supplied content in email HTML** (`esc(...)`) — the personal note is organizer-typed free text.
- **`native_language` stays on the application form** (`lib/application-form.ts`). Only the dashboard *table column* goes away.
- Tests render with French as the default locale (`renderWithIntl`), so component assertions use the French strings.
- Verification gate for every task: `pnpm lint`, `pnpm test`, `pnpm build`.
- Branch: `feature/applications-page-fixes` in worktree `.claude/worktrees/feature+applications-page-fixes`. Confirm with `git branch --show-current` before every commit. Never `git add -A` — stage only named files.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `messages/{fr,en,es,it,de}.json` | i18n catalogs — gender labels, new tabs, new review copy | 1, 2, 4 |
| `components/applications/CandidaturesView.tsx` | Table columns + tab membership (`matchesTab`) | 1, 2 |
| `components/applications/__tests__/CandidaturesView.test.tsx` | Column + tab tests | 1, 2 |
| `actions/applications-review.ts` | `acceptApplication(id, opts)`, `ReviewOp.personalNote`, narrowed detail select | 3, 5 |
| `lib/email.ts` | `sendGoodNewsEmail` optional `personalNote` block | 3 |
| `lib/__tests__/email.good-news.test.ts` | Note-block render + escaping tests | 3 |
| `actions/__tests__/bulk-applications.test.ts` | Accept-path action tests (note threading, declined guard) | 3 |
| `components/applications/ApplicationDetail.tsx` | Always render the review actions | 4 |
| `components/ApplicationReviewActions.tsx` | Per-status UI: submitted / rejected / declined / read-only | 4 |
| `components/__tests__/ApplicationReviewActions.test.tsx` | New component test file | 4 |
| `BACKLOG.md` | Remove the two now-resolved "known pre-existing bugs" lines | 4, 5 |

---

### Task 1: Gender column replaces Native language

**Files:**
- Modify: `messages/fr.json`, `messages/en.json`, `messages/es.json`, `messages/it.json`, `messages/de.json` (each: `organizer.applications.tableHeader`, and a new `organizer.applications.gender` object)
- Modify: `components/applications/CandidaturesView.tsx`
- Test: `components/applications/__tests__/CandidaturesView.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `genderLabel(raw: string | undefined, tr: ReturnType<typeof useTranslations>): string` — module-private in `CandidaturesView.tsx`. New message keys `organizer.applications.tableHeader.gender` and `organizer.applications.gender.{male,female,other}`.

Background: `lib/application-form.ts` stores `data.sex` as one of the radio tokens `'male' | 'female' | 'other'`. Legacy applications may hold free text (see the comment in `components/ApplicationReadView.tsx`), so unknown values render verbatim rather than being blanked.

- [ ] **Step 1: Write the failing test**

In `components/applications/__tests__/CandidaturesView.test.tsx`, add `sex: 'female'` to the first fixture row so the existing counts stay unchanged. The fixture array becomes:

```tsx
const apps: AppRow[] = [
  { id: '1', status: 'submitted', submitted_at: '2026-09-12', responded_at: null, data: { first_name: 'Léa', last_name: 'Moreau', grade: 'Première', native_language: 'Français', sex: 'female' }, email: 'l@m.fr' },
  { id: '2', status: 'submitted', submitted_at: '2026-09-13', responded_at: null, data: { first_name: 'Hugo', last_name: 'Petit' }, email: 'h@p.fr' },
  { id: '3', status: 'rejected', submitted_at: '2026-09-10', responded_at: null, data: {}, email: 'r@r.fr' },
]
```

Then add this test inside the existing `describe('CandidaturesView', ...)` block:

```tsx
  it('shows a Gender column with the localized label, not Native language', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" />)
    expect(screen.getByText('Genre')).toBeInTheDocument()
    expect(screen.queryByText('Langue mat.')).toBeNull()
    // Stored token 'female' renders as its French label…
    expect(screen.getByText('Fille')).toBeInTheDocument()
    // …and the native language value is gone from the table entirely.
    expect(screen.queryByText('Français')).toBeNull()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run components/applications/__tests__/CandidaturesView.test.tsx --exclude '**/.claude/**' -t 'Gender column'`
Expected: FAIL — `Unable to find an element with the text: Genre`.

- [ ] **Step 3: Add the message keys in all five catalogs**

In each catalog, inside `organizer.applications`: delete the `tableHeader.nativeLanguage` entry, add `tableHeader.gender`, and add a sibling `gender` object next to `tableHeader`.

`messages/fr.json`:
```json
"tableHeader": {
  "student": "Élève",
  "level": "Niveau 26-27",
  "gender": "Genre",
  "receivedDate": "Reçue le",
  "status": "Statut"
},
"gender": { "male": "Garçon", "female": "Fille", "other": "Autre" },
```

`messages/en.json`:
```json
"tableHeader": {
  "student": "Student",
  "level": "Grade 26-27",
  "gender": "Gender",
  "receivedDate": "Received on",
  "status": "Status"
},
"gender": { "male": "Male", "female": "Female", "other": "Other" },
```

`messages/es.json`:
```json
"tableHeader": {
  "student": "Alumno",
  "level": "Curso 26-27",
  "gender": "Género",
  "receivedDate": "Recibida el",
  "status": "Estado"
},
"gender": { "male": "Chico", "female": "Chica", "other": "Otro" },
```

`messages/it.json`:
```json
"tableHeader": {
  "student": "Studente",
  "level": "Livello 26-27",
  "gender": "Genere",
  "receivedDate": "Ricevuta il",
  "status": "Stato"
},
"gender": { "male": "Ragazzo", "female": "Ragazza", "other": "Altro" },
```

`messages/de.json`:
```json
"tableHeader": {
  "student": "Schüler",
  "level": "Klasse 26-27",
  "gender": "Geschlecht",
  "receivedDate": "Erhalten am",
  "status": "Status"
},
"gender": { "male": "Junge", "female": "Mädchen", "other": "Divers" },
```

Keep the surrounding keys of `organizer.applications` untouched; only `tableHeader` changes and `gender` is new.

- [ ] **Step 4: Swap the column in the component**

In `components/applications/CandidaturesView.tsx`, add this helper just below the `SELECTABLE` constant (around line 24):

```tsx
// data.sex holds the radio token from lib/application-form.ts. Legacy
// applications predate the choice list and hold free text — render those
// verbatim rather than blanking them (same rule as ApplicationReadView).
function genderLabel(raw: string | undefined, tr: ReturnType<typeof useTranslations>): string {
  switch ((raw ?? '').trim()) {
    case '': return '—'
    case 'male': return tr('organizer.applications.gender.male')
    case 'female': return tr('organizer.applications.gender.female')
    case 'other': return tr('organizer.applications.gender.other')
    default: return (raw ?? '').trim()
  }
}
```

Replace the header cell (line 310):
```tsx
          <span>{tr('organizer.applications.tableHeader.nativeLanguage')}</span>
```
with:
```tsx
          <span>{tr('organizer.applications.tableHeader.gender')}</span>
```

Replace the body cell (line 336):
```tsx
              <span className="text-sm text-navy">{a.data.native_language ?? '—'}</span>
```
with:
```tsx
              <span className="text-sm text-navy">{genderLabel(a.data.sex, tr)}</span>
```

The grid template (`grid-cols-[28px_1.7fr_1fr_1fr_.9fr_1.1fr_22px]`) is unchanged — this is a straight one-for-one swap.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run components/applications/__tests__/CandidaturesView.test.tsx messages/__tests__/parity.test.ts --exclude '**/.claude/**'`
Expected: PASS — all CandidaturesView tests plus catalog parity.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feature/applications-page-fixes
git add messages/fr.json messages/en.json messages/es.json messages/it.json messages/de.json components/applications/CandidaturesView.tsx components/applications/__tests__/CandidaturesView.test.tsx
git commit -m "feat(applications): show Gender instead of Native language in the table"
```

---

### Task 2: Non-overlapping tabs (+ Awaiting and Declined)

**Files:**
- Modify: `messages/{fr,en,es,it,de}.json` (`organizer.applications.tabs`)
- Modify: `components/applications/CandidaturesView.tsx:15-34`, `:66-74`
- Test: `components/applications/__tests__/CandidaturesView.test.tsx`

**Interfaces:**
- Consumes: Task 1's edits to the same component (no API surface).
- Produces: `type TabKey = 'all' | 'invited' | 'toreview' | 'awaiting' | 'accepted' | 'rejected' | 'declined'`. New message keys `organizer.applications.tabs.awaiting` and `organizer.applications.tabs.declined`.

Membership (each status belongs to exactly one non-`all` tab):

| Tab | Statuses |
|---|---|
| all | everything |
| invited | `invited`, `draft` |
| toreview | `submitted` |
| awaiting | `accepted`, `maybe` |
| accepted | `enrolling`, `enrolled` |
| rejected | `rejected` **only** |
| declined | `declined` |

The `invited` tab is pre-existing and stays (the spec's table omits it because it predates this work).

- [ ] **Step 1: Write the failing test**

Add to `components/applications/__tests__/CandidaturesView.test.tsx`, inside the existing `describe` block. Use a **local** fixture so the shared `apps` counts used by other tests do not shift:

```tsx
  it('keeps declined out of the Rejected tab and gives it its own', () => {
    const tabApps: AppRow[] = [
      { id: 'r', status: 'rejected', submitted_at: '2026-09-01', responded_at: null, data: { first_name: 'Rita', last_name: 'Refus' }, email: 'r@x.fr' },
      { id: 'd', status: 'declined', submitted_at: '2026-09-02', responded_at: null, data: { first_name: 'Diane', last_name: 'Desist' }, email: 'd@x.fr' },
    ]
    renderWithIntl(<CandidaturesView apps={tabApps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" />)
    fireEvent.click(screen.getByRole('button', { name: /Refusées/ }))
    expect(screen.getByText('Rita Refus')).toBeInTheDocument()
    expect(screen.queryByText('Diane Desist')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Désistements/ }))
    expect(screen.getByText('Diane Desist')).toBeInTheDocument()
    expect(screen.queryByText('Rita Refus')).toBeNull()
  })

  it('splits organizer-accepted (Awaiting) from student-confirmed (Accepted)', () => {
    const tabApps: AppRow[] = [
      { id: 'a', status: 'accepted', submitted_at: '2026-09-01', responded_at: null, data: { first_name: 'Alex', last_name: 'Attente' }, email: 'a@x.fr' },
      { id: 'm', status: 'maybe', submitted_at: '2026-09-02', responded_at: null, data: { first_name: 'Manon', last_name: 'Peutetre' }, email: 'm@x.fr' },
      { id: 'e', status: 'enrolled', submitted_at: '2026-09-03', responded_at: null, data: { first_name: 'Enzo', last_name: 'Inscrit' }, email: 'e@x.fr' },
    ]
    renderWithIntl(<CandidaturesView apps={tabApps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" />)
    fireEvent.click(screen.getByRole('button', { name: /En attente/ }))
    expect(screen.getByText('Alex Attente')).toBeInTheDocument()
    expect(screen.getByText('Manon Peutetre')).toBeInTheDocument()
    expect(screen.queryByText('Enzo Inscrit')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Acceptées/ }))
    expect(screen.getByText('Enzo Inscrit')).toBeInTheDocument()
    expect(screen.queryByText('Alex Attente')).toBeNull()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run components/applications/__tests__/CandidaturesView.test.tsx --exclude '**/.claude/**' -t 'declined'`
Expected: FAIL — no button named `Désistements`.

- [ ] **Step 3: Add the tab labels in all five catalogs**

Replace `organizer.applications.tabs` in each catalog (key order matters only for readability; parity compares sorted paths):

`messages/fr.json`:
```json
"tabs": { "all": "Toutes", "invited": "Invités", "toReview": "À examiner", "awaiting": "En attente", "accepted": "Acceptées", "rejected": "Refusées", "declined": "Désistements" },
```
`messages/en.json`:
```json
"tabs": { "all": "All", "invited": "Invited", "toReview": "To review", "awaiting": "Awaiting", "accepted": "Accepted", "rejected": "Rejected", "declined": "Declined" },
```
`messages/es.json`:
```json
"tabs": { "all": "Todas", "invited": "Invitados", "toReview": "Por examinar", "awaiting": "En espera", "accepted": "Aceptadas", "rejected": "Rechazadas", "declined": "Han declinado" },
```
`messages/it.json`:
```json
"tabs": { "all": "Tutte", "invited": "Invitati", "toReview": "Da esaminare", "awaiting": "In attesa", "accepted": "Accettate", "rejected": "Rifiutate", "declined": "Rinunce" },
```
`messages/de.json`:
```json
"tabs": { "all": "Alle", "invited": "Eingeladen", "toReview": "Zu prüfen", "awaiting": "Wartet", "accepted": "Angenommen", "rejected": "Abgelehnt", "declined": "Abgesagt" },
```

- [ ] **Step 4: Rewrite the tab membership in the component**

In `components/applications/CandidaturesView.tsx`, replace lines 15-34 (the `TabKey` type through the end of `matchesTab`) with:

```tsx
type TabKey = 'all' | 'invited' | 'toreview' | 'awaiting' | 'accepted' | 'rejected' | 'declined'

const TAB_KEYS: TabKey[] = ['all', 'invited', 'toreview', 'awaiting', 'accepted', 'rejected', 'declined']

// Invited/started rows are organizer-sent invitations still in the funnel; they
// are shown for tracking but never bulk-selectable for accept/reject.
const SELECTABLE = (a: AppRow) => a.status !== 'invited' && a.status !== 'draft'

// Every status belongs to exactly one non-"all" tab. "rejected" is the
// organizer saying no; "declined" is the student saying no — conflating them
// (as the old REJECTED_STATUSES did) made a declined student look refused.
// "awaiting" is organizer-accepted with no student reply yet; "accepted" means
// the student confirmed.
function matchesTab(a: AppRow, key: TabKey): boolean {
  switch (key) {
    case 'all': return true
    case 'invited': return a.status === 'invited' || a.status === 'draft'
    case 'toreview': return a.status === 'submitted'
    case 'awaiting': return a.status === 'accepted' || a.status === 'maybe'
    case 'accepted': return a.status === 'enrolling' || a.status === 'enrolled'
    case 'rejected': return a.status === 'rejected'
    case 'declined': return a.status === 'declined'
  }
}
```

(The `genderLabel` helper added in Task 1 sits just below this block — keep it.)

Then replace the `tabLabel` switch (lines 66-74) with:

```tsx
  function tabLabel(key: TabKey): string {
    switch (key) {
      case 'all': return tr('organizer.applications.tabs.all')
      case 'invited': return tr('organizer.applications.tabs.invited')
      case 'toreview': return tr('organizer.applications.tabs.toReview')
      case 'awaiting': return tr('organizer.applications.tabs.awaiting')
      case 'accepted': return tr('organizer.applications.tabs.accepted')
      case 'rejected': return tr('organizer.applications.tabs.rejected')
      case 'declined': return tr('organizer.applications.tabs.declined')
    }
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run components/applications/__tests__ messages/__tests__/parity.test.ts --exclude '**/.claude/**'`
Expected: PASS — including the pre-existing `tabs filter with counts` test.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feature/applications-page-fixes
git add messages/fr.json messages/en.json messages/es.json messages/it.json messages/de.json components/applications/CandidaturesView.tsx components/applications/__tests__/CandidaturesView.test.tsx
git commit -m "feat(applications): split declined from rejected, add Awaiting/Declined tabs"
```

---

### Task 3: `personalNote` on the single-item accept, through to the email

**Files:**
- Modify: `actions/applications-review.ts:124-127` (`ReviewOp`), `:196-229` (accept branch), `:272-275` (`acceptApplication`), `:293-295` (`acceptApplications`)
- Modify: `lib/email.ts:177-200` (`sendGoodNewsEmail`)
- Test: `actions/__tests__/bulk-applications.test.ts`, `lib/__tests__/email.good-news.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `acceptApplication(applicationId: string, opts?: { personalNote?: string }): Promise<void>` — Task 4's UI calls this.
  - `ReviewOp = { kind: 'accept'; personalNote: string | null } | { kind: 'reject'; note: string; sendEmail: boolean }`.
  - `sendGoodNewsEmail(opts: { …existing…, personalNote?: string | null })`.
  - `acceptApplications(ids: string[])` is unchanged in signature and always passes `personalNote: null`.

The existing `ACCEPTABLE_STATUSES = ['submitted', 'rejected']` guard is *kept as is* — it is the server-side backstop that refuses `declined` (point 3 of the spec) while permitting the deliberate `rejected → accepted` un-reject (point 4).

- [ ] **Step 1: Write the failing email test**

Add to `lib/__tests__/email.good-news.test.ts`, inside `describe('sendGoodNewsEmail', ...)`:

```tsx
  it('renders an escaped personal note block when one is supplied', async () => {
    await sendGoodNewsEmail({
      to: ['dad@x.fr'], studentName: 'M', exchangeName: 'E',
      subject: null, body: null,
      respondUrl: 'https://app.test/invite/t', language: 'fr',
      personalNote: 'Une place s’est libérée <b>enfin</b>',
    })
    const { html } = sendMock.mock.calls[0][0]
    expect(html).toContain('Une place s’est libérée')
    expect(html).toContain('&lt;b&gt;enfin&lt;/b&gt;')
  })

  it('renders no note block when none is supplied', async () => {
    await sendGoodNewsEmail({
      to: ['dad@x.fr'], studentName: 'M', exchangeName: 'E',
      subject: null, body: null,
      respondUrl: 'https://app.test/invite/t', language: 'fr',
    })
    const { html } = sendMock.mock.calls[0][0]
    expect(html).not.toContain('#EAF7F0')
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run lib/__tests__/email.good-news.test.ts --exclude '**/.claude/**'`
Expected: FAIL — TypeScript/runtime: `personalNote` is not an accepted property (the escaped-note assertion fails).

- [ ] **Step 3: Add `personalNote` to `sendGoodNewsEmail`**

In `lib/email.ts`, replace the whole `sendGoodNewsEmail` function (lines 177-200) with:

```ts
export async function sendGoodNewsEmail(opts: {
  to: string[]
  studentName: string
  exchangeName: string
  subject: string | null
  body: string | null
  respondUrl: string
  language: 'en' | 'fr'
  // Free text typed by the organizer when they change their mind about a
  // rejected application. Organizer-authored → always escaped.
  personalNote?: string | null
  ctx?: EmailLogContext
}): Promise<void> {
  const { subject, bodyHtml } = renderGoodNews({
    subject: opts.subject, body: opts.body,
    studentName: opts.studentName, exchangeName: opts.exchangeName,
  })
  const noteHtml = opts.personalNote?.trim()
    ? `<p style="background:#EAF7F0;border:1px solid #E7F1EC;border-radius:8px;padding:12px;">${esc(opts.personalNote.trim()).replace(/\n/g, '<br>')}</p>`
    : ''
  const labels = GOOD_NEWS_BUTTONS[opts.language]
  const btn = (href: string, label: string, bg: string) =>
    `<a href="${href}" style="display:block;text-align:center;background:${bg};color:#fff;text-decoration:none;padding:12px 16px;border-radius:9px;margin-bottom:8px;font-weight:600;">${esc(label)}</a>`
  const buttons =
    btn(`${opts.respondUrl}?r=yes`, labels.yes, '#1F7A57') +
    btn(`${opts.respondUrl}?r=no`, labels.no, '#5C7268') +
    btn(`${opts.respondUrl}?r=maybe`, labels.maybe, '#2456E6')
  const html = layout(`${bodyHtml}${noteHtml}<div style="margin-top:20px;">${buttons}</div>`, APP_FOOTER_FR)
  await send(opts.to, subject, html, 'good news email', opts.ctx)
}
```

- [ ] **Step 4: Run the email tests to verify they pass**

Run: `pnpm vitest run lib/__tests__/email.good-news.test.ts --exclude '**/.claude/**'`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing action tests**

Add to `actions/__tests__/bulk-applications.test.ts`. There is an existing `describe('acceptApplications', ...)`; append a new top-level describe after it:

```ts
describe('acceptApplication (single, change-of-mind)', () => {
  it('un-rejects and threads the personal note into the good-news email', async () => {
    scenario.applications['app-rejected'] = {
      ...scenario.applications['app-ok'], id: 'app-rejected', status: 'rejected',
    }
    await acceptApplication('app-rejected', { personalNote: 'Une place s’est libérée !' })
    expect(updates.map(u => u.id)).toEqual(['app-rejected'])
    expect(updates[0].row.status).toBe('accepted')
    expect(sendGoodNewsEmail).toHaveBeenCalledWith(
      expect.objectContaining({ personalNote: 'Une place s’est libérée !' }),
    )
  })

  it('refuses to accept an application the student declined', async () => {
    scenario.applications['app-declined'] = {
      ...scenario.applications['app-ok'], id: 'app-declined', status: 'declined',
    }
    await expect(acceptApplication('app-declined')).rejects.toThrow(
      'Only a submitted application can be accepted',
    )
    expect(updates).toEqual([])
    expect(sendGoodNewsEmail).not.toHaveBeenCalled()
  })

  it('sends no personal note when none was given', async () => {
    await acceptApplication('app-ok')
    expect(sendGoodNewsEmail).toHaveBeenCalledWith(
      expect.objectContaining({ personalNote: null }),
    )
  })

  it('bulk accept never carries a personal note', async () => {
    await acceptApplications(['app-ok'])
    expect(sendGoodNewsEmail).toHaveBeenCalledWith(
      expect.objectContaining({ personalNote: null }),
    )
  })
})
```

- [ ] **Step 6: Run them to verify they fail**

Run: `pnpm vitest run actions/__tests__/bulk-applications.test.ts --exclude '**/.claude/**' -t 'change-of-mind'`
Expected: FAIL — `sendGoodNewsEmail` was called without a `personalNote` property.

- [ ] **Step 7: Thread the note through the review engine**

In `actions/applications-review.ts`, replace the `ReviewOp` type (lines 124-127) with:

```ts
type ReviewOp =
  | { kind: 'accept'; personalNote: string | null }
  | { kind: 'reject'; note: string; sendEmail: boolean }
```

Update the comment above `ACCEPTABLE_STATUSES` (lines 153-156) to document the now-deliberate un-reject:

```ts
// Only a submitted application can be accepted — plus a rejected one, which is
// the organizer deliberately changing their mind (they may attach a personal
// note; see acceptApplication). `declined` is absent on purpose: once the
// student has said no, only a fresh application can restart the flow. This is
// the server-side backstop for the UI lock in ApplicationReviewActions.
const ACCEPTABLE_STATUSES = ['submitted', 'rejected']
```

In the accept branch, add the note to the `sendGoodNewsEmail` call (line 219-228) — only that one property changes:

```ts
          void sendGoodNewsEmail({
            to: parentRecipients(app.data as Record<string, string>, app.email),
            studentName: buildApplicantName(app.data),
            exchangeName: exchange?.name ?? '',
            subject: exchange?.good_news_subject ?? null,
            body: exchange?.good_news_body ?? null,
            respondUrl: `${APP_URL}/invite/${inviteToken}`,
            language: app.language === 'fr' ? 'fr' : 'en',
            personalNote: op.personalNote,
            ctx: { schoolId: app.school_id, exchangeId: app.exchange_id },
          }).catch(() => {})
```

Replace `acceptApplication` (lines 272-275) with:

```ts
// `opts.personalNote` is the "change your mind" message an organizer may attach
// when re-inviting a candidate they had rejected. Empty/whitespace collapses to
// null so the email renders no note block.
export async function acceptApplication(
  applicationId: string,
  opts?: { personalNote?: string },
): Promise<void> {
  const [outcome] = await reviewApplications([applicationId], {
    kind: 'accept', personalNote: opts?.personalNote?.trim() || null,
  })
  if (outcome && !outcome.ok) throw outcome.error
}
```

Replace `acceptApplications` (lines 293-295) with:

```ts
export async function acceptApplications(ids: string[]): Promise<{ succeeded: number; failed: number }> {
  // Bulk accept carries no personal note — one message cannot fit 30 families.
  return tally(await reviewApplications(ids, { kind: 'accept', personalNote: null }))
}
```

- [ ] **Step 8: Run the action tests to verify they pass**

Run: `pnpm vitest run actions/__tests__/bulk-applications.test.ts lib/__tests__/email.good-news.test.ts --exclude '**/.claude/**'`
Expected: PASS — all tests in both files.

- [ ] **Step 9: Commit**

```bash
git branch --show-current   # must print feature/applications-page-fixes
git add actions/applications-review.ts lib/email.ts actions/__tests__/bulk-applications.test.ts lib/__tests__/email.good-news.test.ts
git commit -m "feat(applications): optional personal note on a change-of-mind accept"
```

---

### Task 4: Detail-page actions — change your mind / declined is terminal

**Files:**
- Modify: `messages/{fr,en,es,it,de}.json` (`organizer.applications.review`)
- Modify: `components/applications/ApplicationDetail.tsx:58-68`
- Modify: `components/ApplicationReviewActions.tsx` (full rewrite of the render body)
- Modify: `BACKLOG.md` (remove the un-reject line)
- Test: `components/__tests__/ApplicationReviewActions.test.tsx` (create)

**Interfaces:**
- Consumes: `acceptApplication(applicationId, { personalNote })` from Task 3.
- Produces: no new exports. New message keys under `organizer.applications.review`: `changeMind`, `personalNoteLabel`, `personalNotePlaceholder`, `confirmInvite`, `declinedLocked`, `statusNotSubmitted`.

`ApplicationDetail` currently renders `ApplicationReviewActions` only when `status === 'submitted'`, which makes every other branch of the component dead code. Removing the gate is what activates the rejected/declined behavior.

- [ ] **Step 1: Write the failing component test**

Create `components/__tests__/ApplicationReviewActions.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const acceptApplication = vi.fn().mockResolvedValue(undefined)
const rejectApplication = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/applications-review', () => ({
  acceptApplication: (...a: unknown[]) => acceptApplication(...a),
  rejectApplication: (...a: unknown[]) => rejectApplication(...a),
}))

import { ApplicationReviewActions } from '@/components/ApplicationReviewActions'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ApplicationReviewActions', () => {
  it('offers Accept and Reject on a submitted application', () => {
    renderWithIntl(<ApplicationReviewActions applicationId="a1" exchangeId="ex1" status="submitted" response={null} note={null} />)
    expect(screen.getByRole('button', { name: 'Accepter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeInTheDocument()
  })

  it('lets an organizer change their mind on a rejected application, with an optional note', async () => {
    renderWithIntl(<ApplicationReviewActions applicationId="a1" exchangeId="ex1" status="rejected" response={null} note="Dossier incomplet" />)
    expect(screen.getByText(/Actuellement refusée/)).toBeInTheDocument()
    // No direct Accept button — the re-invite is behind an explicit control.
    expect(screen.queryByRole('button', { name: 'Accepter' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Changer d’avis et inviter' }))
    fireEvent.change(screen.getByPlaceholderText(/Message facultatif/), {
      target: { value: 'Une place s’est libérée !' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Inviter' }))
    await waitFor(() =>
      expect(acceptApplication).toHaveBeenCalledWith('a1', { personalNote: 'Une place s’est libérée !' }),
    )
  })

  it('sends no note when the organizer leaves the message empty', async () => {
    renderWithIntl(<ApplicationReviewActions applicationId="a1" exchangeId="ex1" status="rejected" response={null} note={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Changer d’avis et inviter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Inviter' }))
    await waitFor(() => expect(acceptApplication).toHaveBeenCalledWith('a1', { personalNote: '' }))
  })

  it('locks a declined application — no accept or re-invite control', () => {
    renderWithIntl(<ApplicationReviewActions applicationId="a1" exchangeId="ex1" status="declined" response="no" note={null} />)
    expect(screen.getByText('A décliné l’invitation')).toBeInTheDocument()
    expect(screen.getByText(/ne peut plus être réinvité/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is read-only for a student-confirmed application', () => {
    renderWithIntl(<ApplicationReviewActions applicationId="a1" exchangeId="ex1" status="enrolled" response="yes" note={null} />)
    expect(screen.getByText('Inscrit(e) (a répondu Oui)')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is read-only for an application that was never submitted', () => {
    renderWithIntl(<ApplicationReviewActions applicationId="a1" exchangeId="ex1" status="invited" response={null} note={null} />)
    expect(screen.getByText(/n’a pas encore envoyé/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run components/__tests__/ApplicationReviewActions.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — missing message keys / no `Changer d’avis et inviter` button.

- [ ] **Step 3: Add the review message keys in all five catalogs**

Replace `organizer.applications.review` in each catalog with the block below (existing keys unchanged, six new ones appended). Note the French typographic apostrophes.

`messages/fr.json`:
```json
"review": {
  "statusAccepted": "Accepté — en attente de réponse",
  "statusEnrolled": "Inscrit(e) (a répondu Oui)",
  "statusDeclined": "A décliné l’invitation",
  "statusMaybe": "A répondu Peut-être",
  "statusNotSubmitted": "Cet élève n’a pas encore envoyé sa candidature.",
  "responseLabel": "Réponse :",
  "noteLabel": "Note :",
  "currentlyRejected": "Actuellement refusée.",
  "declinedLocked": "L’élève a décliné : il ne peut plus être réinvité depuis cette page.",
  "changeMind": "Changer d’avis et inviter",
  "personalNoteLabel": "Message pour la famille (facultatif)",
  "personalNotePlaceholder": "Message facultatif ajouté à l’e-mail d’invitation",
  "confirmInvite": "Inviter",
  "accept": "Accepter",
  "notePlaceholder": "Note facultative à l’intention du candidat",
  "sendRejectionEmail": "Envoyer un e-mail de refus au candidat"
},
```

`messages/en.json`:
```json
"review": {
  "statusAccepted": "Accepted — awaiting response",
  "statusEnrolled": "Enrolled (said Yes)",
  "statusDeclined": "Declined the invitation",
  "statusMaybe": "Responded Maybe",
  "statusNotSubmitted": "This student hasn't submitted their application yet.",
  "responseLabel": "Response:",
  "noteLabel": "Note:",
  "currentlyRejected": "Currently rejected.",
  "declinedLocked": "The student declined: they can no longer be re-invited from this page.",
  "changeMind": "Change your mind and invite",
  "personalNoteLabel": "Message to the family (optional)",
  "personalNotePlaceholder": "Optional message added to the invitation email",
  "confirmInvite": "Invite",
  "accept": "Accept",
  "notePlaceholder": "Optional note to the applicant",
  "sendRejectionEmail": "Send a rejection email to the applicant"
},
```

`messages/es.json`:
```json
"review": {
  "statusAccepted": "Aceptado — a la espera de respuesta",
  "statusEnrolled": "Inscrito(a) (ha respondido Sí)",
  "statusDeclined": "Ha declinado la invitación",
  "statusMaybe": "Ha respondido Quizás",
  "statusNotSubmitted": "Este alumno todavía no ha enviado su candidatura.",
  "responseLabel": "Respuesta:",
  "noteLabel": "Nota:",
  "currentlyRejected": "Actualmente rechazada.",
  "declinedLocked": "El alumno ha declinado: ya no se le puede volver a invitar desde esta página.",
  "changeMind": "Cambiar de opinión e invitar",
  "personalNoteLabel": "Mensaje para la familia (opcional)",
  "personalNotePlaceholder": "Mensaje opcional añadido al correo de invitación",
  "confirmInvite": "Invitar",
  "accept": "Aceptar",
  "notePlaceholder": "Nota opcional para el candidato",
  "sendRejectionEmail": "Enviar un correo de rechazo al candidato"
},
```

`messages/it.json`:
```json
"review": {
  "statusAccepted": "Accettato — in attesa di risposta",
  "statusEnrolled": "Iscritto/a (ha risposto Sì)",
  "statusDeclined": "Ha rifiutato l’invito",
  "statusMaybe": "Ha risposto Forse",
  "statusNotSubmitted": "Questo studente non ha ancora inviato la sua candidatura.",
  "responseLabel": "Risposta:",
  "noteLabel": "Nota:",
  "currentlyRejected": "Attualmente rifiutata.",
  "declinedLocked": "Lo studente ha rinunciato: non può più essere invitato da questa pagina.",
  "changeMind": "Cambia idea e invita",
  "personalNoteLabel": "Messaggio per la famiglia (facoltativo)",
  "personalNotePlaceholder": "Messaggio facoltativo aggiunto all’e-mail di invito",
  "confirmInvite": "Invita",
  "accept": "Accetta",
  "notePlaceholder": "Nota facoltativa per il candidato",
  "sendRejectionEmail": "Invia un’e-mail di rifiuto al candidato"
},
```

`messages/de.json`:
```json
"review": {
  "statusAccepted": "Angenommen — wartet auf Antwort",
  "statusEnrolled": "Eingeschrieben (hat Ja geantwortet)",
  "statusDeclined": "Hat die Einladung abgelehnt",
  "statusMaybe": "Hat mit Vielleicht geantwortet",
  "statusNotSubmitted": "Dieser Schüler hat seine Bewerbung noch nicht abgeschickt.",
  "responseLabel": "Antwort:",
  "noteLabel": "Notiz:",
  "currentlyRejected": "Derzeit abgelehnt.",
  "declinedLocked": "Der Schüler hat abgesagt: Eine erneute Einladung ist auf dieser Seite nicht mehr möglich.",
  "changeMind": "Meinung ändern und einladen",
  "personalNoteLabel": "Nachricht an die Familie (optional)",
  "personalNotePlaceholder": "Optionale Nachricht in der Einladungs-E-Mail",
  "confirmInvite": "Einladen",
  "accept": "Annehmen",
  "notePlaceholder": "Optionale Notiz an den Bewerber",
  "sendRejectionEmail": "Eine Ablehnungs-E-Mail an den Bewerber senden"
},
```

Note `currentlyRejected` loses its second sentence ("Vous pouvez toujours l’accepter." and the equivalents) — the change-your-mind button now says that.

- [ ] **Step 4: Rewrite `ApplicationReviewActions`**

Replace the whole body of `components/ApplicationReviewActions.tsx` with:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { acceptApplication, rejectApplication } from '@/actions/applications-review'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props { applicationId: string; exchangeId: string; status: string; response: string | null; note: string | null }

// Rendered for EVERY application status — the component, not the caller,
// decides what an organizer may do. Each branch mirrors a server-side guard in
// actions/applications-review.ts (ACCEPTABLE_STATUSES / REJECTABLE_STATUSES);
// the UI never offers an action the action layer would refuse.
export function ApplicationReviewActions({ applicationId, status, response, note }: Props) {
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [reinviting, setReinviting] = useState(false)
  const [personalNote, setPersonalNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const t = useTranslations()

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn(); router.push('/applications') }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }

  function ReadOnly({ label, hint }: { label: string; hint?: string }) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        {response && <p className="text-sm text-muted-foreground">{t('organizer.applications.review.responseLabel')} <strong>{response}</strong></p>}
        {note && <p className="text-sm text-muted-foreground">{t('organizer.applications.review.noteLabel')} {note}</p>}
      </div>
    )
  }

  // The student said no. Terminal: acceptApplication would throw anyway
  // (`declined` is not in ACCEPTABLE_STATUSES), so offer no control at all.
  if (status === 'declined') {
    return (
      <ReadOnly
        label={t('organizer.applications.review.statusDeclined')}
        hint={t('organizer.applications.review.declinedLocked')}
      />
    )
  }

  if (status === 'accepted') return <ReadOnly label={t('organizer.applications.review.statusAccepted')} />
  if (status === 'maybe') return <ReadOnly label={t('organizer.applications.review.statusMaybe')} />
  if (status === 'enrolling' || status === 'enrolled') {
    return <ReadOnly label={t('organizer.applications.review.statusEnrolled')} />
  }

  // The organizer said no and may change their mind — optionally explaining
  // why in a message that rides along with the invitation email.
  if (status === 'rejected') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">{t('organizer.applications.review.currentlyRejected')}</p>
        {note && <p className="text-sm text-muted-foreground">{t('organizer.applications.review.noteLabel')} {note}</p>}
        {!reinviting ? (
          <Button variant="outline" disabled={busy} onClick={() => setReinviting(true)}>
            {t('organizer.applications.review.changeMind')}
          </Button>
        ) : (
          <div className="space-y-2">
            <label htmlFor="reinvite-note" className="block text-sm text-muted-foreground">
              {t('organizer.applications.review.personalNoteLabel')}
            </label>
            <Textarea
              id="reinvite-note"
              placeholder={t('organizer.applications.review.personalNotePlaceholder')}
              value={personalNote}
              onChange={e => setPersonalNote(e.target.value)}
            />
            <div className="flex gap-3">
              <Button disabled={busy} onClick={() => run(() => acceptApplication(applicationId, { personalNote }))}>
                {t('organizer.applications.review.confirmInvite')}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setReinviting(false)}>
                {t('common.actions.cancel')}
              </Button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  // invited / draft — nothing to review yet.
  if (status !== 'submitted') {
    return <ReadOnly label={t('organizer.applications.review.statusNotSubmitted')} />
  }

  return (
    <div className="space-y-3">
      {!rejecting ? (
        <div className="flex gap-3">
          <Button disabled={busy} onClick={() => run(() => acceptApplication(applicationId))}>{t('organizer.applications.review.accept')}</Button>
          <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>{t('organizer.applications.rejectCta')}</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea placeholder={t('organizer.applications.review.notePlaceholder')} value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
            {t('organizer.applications.review.sendRejectionEmail')}
          </label>
          <div className="flex gap-3">
            <Button variant="destructive" disabled={busy} onClick={() => run(() => rejectApplication(applicationId, rejectNote, sendEmail))}>{t('organizer.applications.confirmRejectCta')}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>{t('common.actions.cancel')}</Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 5: Remove the `submitted`-only gate in `ApplicationDetail`**

In `components/applications/ApplicationDetail.tsx`, replace lines 58-68:

```tsx
      {application.status === 'submitted' && (
        <div data-noprint className="mt-6">
          <ApplicationReviewActions
            applicationId={application.id}
            exchangeId={application.exchange_id}
            status={application.status}
            response={application.invite_response}
            note={application.invite_response_note ?? application.review_note}
          />
        </div>
      )}
```

with (the component now self-selects by status):

```tsx
      <div data-noprint className="mt-6">
        <ApplicationReviewActions
          applicationId={application.id}
          exchangeId={application.exchange_id}
          status={application.status}
          response={application.invite_response}
          note={application.invite_response_note ?? application.review_note}
        />
      </div>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run components/__tests__/ApplicationReviewActions.test.tsx messages/__tests__/parity.test.ts --exclude '**/.claude/**'`
Expected: PASS — 6 component tests + parity.

- [ ] **Step 7: Remove the resolved BACKLOG line**

In `BACKLOG.md`, delete these two lines from "Known pre-existing bugs":

```
- `acceptApplication` allows a `rejected → accepted` un-reject; undocumented
  behavior, decide whether it is intended.
```

The behavior is now a documented product feature ("change your mind", with an optional message), guarded in the UI and on the server.

- [ ] **Step 8: Commit**

```bash
git branch --show-current   # must print feature/applications-page-fixes
git add messages/fr.json messages/en.json messages/es.json messages/it.json messages/de.json components/ApplicationReviewActions.tsx components/applications/ApplicationDetail.tsx components/__tests__/ApplicationReviewActions.test.tsx BACKLOG.md
git commit -m "feat(applications): change-of-mind re-invite; declined is terminal"
```

---

### Task 5: Narrow `getApplicationForReview` to explicit columns

**Files:**
- Modify: `actions/applications-review.ts:36-43` (`assertOrganizerOwnsApplication`), `:148-151` (the `REVIEW_COLUMNS` comment)
- Modify: `BACKLOG.md` (remove the `select('*')` line)
- Test: `actions/__tests__/application-detail-columns.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `REVIEW_DETAIL_COLUMNS` (module-private const in `actions/applications-review.ts`).

`assertOrganizerOwnsApplication` is called from exactly one place — `getApplicationForReview` — so narrowing it narrows the detail read. The consumers of the returned row are `getApplicationForReview` itself (`photo_path`, `school_id`) and `ApplicationDetail` (`id`, `exchange_id`, `status`, `data`, `invite_response`, `invite_response_note`, `review_note`). `email` is kept because `applicantName(data) || application.email` is the display-name fallback. `resume_token` / `invite_token` / `*_expires_at` are the point of the fix and must not appear.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/application-detail-columns.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/email', () => ({
  sendGoodNewsEmail: vi.fn(),
  sendApplicationRejectionEmail: vi.fn(),
  sendApplicationInviteEmail: vi.fn(),
}))
vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => ({ id: 'org-1' }),
  getProfile: async () => ({ id: 'org-1', role: 'organizer', school_id: 'school-1' }),
}))

// Every column list handed to .select(), in call order.
let selectCalls: string[] = []

const applicationRow = {
  id: 'app-1', exchange_id: 'ex-1', school_id: 'school-1', status: 'submitted',
  email: 'stu@x.fr', data: { first_name: 'Léa' }, photo_path: null,
  invite_response: null, invite_response_note: null, review_note: null,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      const b: any = {
        select: (cols: string) => { selectCalls.push(cols); return b },
        eq: () => b,
        maybeSingle: async () => ({ data: applicationRow, error: null }),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { getApplicationForReview } from '../applications-review'

beforeEach(() => { selectCalls = [] })

describe('getApplicationForReview', () => {
  it('never selects the private funnel tokens', async () => {
    await getApplicationForReview('app-1')
    expect(selectCalls).toHaveLength(1)
    const cols = selectCalls[0]
    expect(cols).not.toBe('*')
    expect(cols).not.toContain('resume_token')
    expect(cols).not.toContain('invite_token')
  })

  it('selects every column the detail view consumes', async () => {
    await getApplicationForReview('app-1')
    const cols = selectCalls[0].split(',').map(c => c.trim())
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'exchange_id', 'school_id', 'status', 'email', 'data', 'photo_path',
      'invite_response', 'invite_response_note', 'review_note',
    ]))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run actions/__tests__/application-detail-columns.test.ts --exclude '**/.claude/**'`
Expected: FAIL — `expected '*' not to be '*'`.

- [ ] **Step 3: Narrow the select**

In `actions/applications-review.ts`, add the constant just above `assertOrganizerOwnsApplication` (i.e. right after the `ApplicationListRow` type, ~line 35):

```ts
// The detail read for one application. Deliberately not `select('*')`: the row
// carries resume_token / invite_token, which the review screen has no use for
// and which must never travel further than they have to. Mirrors
// REVIEW_COLUMNS below. Consumers: getApplicationForReview (photo_path,
// school_id) and components/applications/ApplicationDetail.tsx.
const REVIEW_DETAIL_COLUMNS =
  'id, exchange_id, school_id, status, email, data, photo_path, invite_response, invite_response_note, review_note'
```

and change the select inside `assertOrganizerOwnsApplication`:

```ts
  const { data: app } = await supabase
    .from('applications').select(REVIEW_DETAIL_COLUMNS).eq('id', applicationId).maybeSingle()
```

Then update the stale cross-reference in the `REVIEW_COLUMNS` comment (line 148-150) — the backlog item it points at is gone:

```ts
// Deliberately not `select('*')`: this read is wide (every id in the batch),
// and the row carries resume_token / invite_token, which have no business
// here. Same rule as REVIEW_DETAIL_COLUMNS on the detail read.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run actions/__tests__/application-detail-columns.test.ts --exclude '**/.claude/**'`
Expected: PASS (2 tests).

- [ ] **Step 5: Remove the resolved BACKLOG line**

In `BACKLOG.md`, delete these two lines from "Known pre-existing bugs":

```
- `getApplicationForReview` selects `*` including resume tokens server-side (not
  serialized to the browser today, but the select should be narrowed).
```

Only the `sendRejectionEmail` English-copy line remains under that heading — keep it and keep the heading.

- [ ] **Step 6: Full gate**

Run, in order:
```bash
pnpm lint
pnpm vitest run --exclude '**/.claude/**'
pnpm build
```
Expected: lint clean; all suites pass; build succeeds with no type errors. (`pnpm test` also works but sweeps sibling worktrees' test files — use the `--exclude` form from inside a worktree.)

No `pnpm test:rls`: this change touches no migration, policy, or bucket.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print feature/applications-page-fixes
git add actions/applications-review.ts actions/__tests__/application-detail-columns.test.ts BACKLOG.md
git commit -m "refactor(applications): narrow getApplicationForReview off select('*')"
```

---

## Manual verification (after merge)

Not automatable in this repo's test setup; do it against staging or prod with a seeded exchange:

1. Candidatures table shows **Genre** with a real value, no **Langue mat.** column.
2. A `declined` student appears under **Désistements** only, never under **Refusées**.
3. Clicking a declined student shows the locked notice with no buttons.
4. Clicking a rejected student → **Changer d’avis et inviter** → type a message → **Inviter** → the family receives the good-news email with the message block, and the row moves to **En attente**.
