# Parent "Bonne nouvelle" Confirmation Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the student-facing acceptance email into a parent-facing, per-exchange, customizable "Bonne nouvelle" email with inline Yes / No / Maybe buttons, where "Yes" records the family's commitment and separately emails the student a set-your-password link, and "Maybe" collects questions the organizer reviews on the candidate card.

**Architecture:** A new nullable per-exchange template (`exchanges.good_news_subject/body`, defaulting to a built-in French template) is authored under Settings → Programme and rendered by a shared pure module (`lib/good-news-template.ts`) used by both the settings preview and the email. `acceptApplication` sends the rendered email to the parents (`father_email`/`mother_email`, falling back to the student email). The three buttons deep-link to `/invite/[token]?r=yes|no|maybe`; the parent confirms on that page. `respondToInvitation`'s "Yes" path creates the student account + enrollment as today but **mints no session for the parent** — instead it emails the student a magiclink `/auth/confirm?…&next=/accept-invite` URL.

**Tech Stack:** Next.js 14+ App Router (Server Actions), Supabase (Postgres + RLS + Auth), Resend, Tailwind + shadcn/ui, next-intl (5 locales), Vitest.

## Global Constraints

- Package manager is **pnpm** (never npm).
- **Escape all organizer-authored and user-supplied content in email HTML** — organizer template body and student/exchange names must be HTML-escaped.
- **Never log student/parent PII** (emails, names, submission contents) to console/logs/analytics — the `email_send_log` table row is the only home for a recipient address.
- **Expected outcomes are structured return values, not throws** — prod redacts thrown Server Action/RSC messages. Only throw for genuinely unexpected failures.
- **Migration workflow (CLAUDE.md):** write local migration → apply to **staging first** (`supabase db push --db-url "$STAGING_DB_URL"`) → apply to prod via MCP `apply_migration` → `list_migrations` drift check (git mv if the stamped version differs) → MCP `generate_typescript_types` overwrite `types/supabase.ts` verbatim → `npx tsc --noEmit` (fix `types/db.ts` alias, never hand-edit generated types).
- **Any migration touching tables/RLS ships RLS matrix cases in the same PR and passes `pnpm test:rls`.**
- **i18n parity:** every new message key must exist in all five catalogs (`messages/{en,fr,es,it,de}.json`) with non-empty values — `messages/__tests__/parity.test.ts` enforces identical key sets against `fr.json`.
- **Auth preambles are shared helpers** — use `requireOrganizer()` / `requireUser()`; never hand-roll the auth dance.
- **Verifying Changes (run before done):** `pnpm lint && pnpm test && pnpm build`; plus `pnpm test:rls` for the migration task.

---

## File Structure

- `supabase/migrations/20260719000001_good_news_template.sql` — new: two nullable `exchanges` columns.
- `types/supabase.ts` (regenerated), `types/db.ts` (alias verification only).
- `tests/rls/matrix.test.ts` — add deny + allow cases for the new columns.
- `lib/good-news-template.ts` — new: `DEFAULT_GOOD_NEWS_SUBJECT/BODY` + `renderGoodNews`. Pure, unit-tested. Shared by settings preview + email.
- `lib/application-form.ts` — `father_email` becomes required; add `parentRecipients()`.
- `lib/exchange-terms.ts` — add `EXCHANGE_TERMS_RESPOND_PARENT`.
- `lib/email.ts` — add `sendGoodNewsEmail`, `sendStudentSetupEmail`; widen `send()` recipient to `string | string[]`.
- `actions/applications-review.ts` — `acceptApplication` sends the good-news email to parents.
- `actions/invitations.ts` — "Yes" path emails the student a setup link, mints no parent session; idempotent recovery no longer mints sessions.
- `actions/settings.ts` — `updateGoodNewsTemplate`; extend `ProgramInfo` + `getProgramInfo`.
- `components/settings/GoodNewsCard.tsx` — new authoring card (subject/body/preview).
- `components/settings/SettingsView.tsx` — mount the card under `section === 'prog'`.
- `components/InviteResponseForm.tsx`, `app/invite/[token]/page.tsx` — parent-facing copy + `?r=` preselect.
- `components/applications/ApplicationDetail.tsx` — surface `invite_response_note` for `maybe`.
- `messages/{en,fr,es,it,de}.json` — new organizer keys.
- Test files: `lib/__tests__/good-news-template.test.ts`, `lib/__tests__/application-form.test.ts` (update), `lib/__tests__/email.good-news.test.ts`, `actions/__tests__/applications.test.ts` (update), `actions/__tests__/bulk-applications.test.ts` (update).

---

## Task 1: Migration — `good_news_subject` / `good_news_body` columns + RLS matrix

**Files:**
- Create: `supabase/migrations/20260719000001_good_news_template.sql`
- Modify: `tests/rls/matrix.test.ts` (add cases)
- Regenerate: `types/supabase.ts`; verify `types/db.ts` still compiles.

**Interfaces:**
- Produces: `exchanges.good_news_subject text` (nullable), `exchanges.good_news_body text` (nullable), both writable by an organizer for their own school under the existing `"organizers update exchanges"` UPDATE policy.

**Context:** The existing UPDATE policy (`20260630000002_exchanges_update_policy.sql`) is row-level and covers the whole row, and `exchanges` has a table-level UPDATE grant (proven: `updateReminderSettings` writes `reminder_*` columns added the same way and works in prod). So new columns need **no new policy** — the matrix allow-case verifies the grant empirically.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260719000001_good_news_template.sql`:

```sql
-- Per-exchange "Bonne nouvelle" parent-confirmation email template.
--
-- Nullable: when null, the app falls back to the built-in default template
-- (lib/good-news-template.ts). Written only by an organizer server action
-- (updateGoodNewsTemplate), RLS-scoped to the caller's own school via the
-- existing "organizers update exchanges" UPDATE policy (row-level, whole-row).
-- No new policy or column grant is needed: exchanges has a table-level UPDATE
-- grant, so these columns are writable exactly like reminder_cadence.

alter table exchanges
  add column good_news_subject text,
  add column good_news_body text;
```

- [ ] **Step 2: Add the RLS matrix deny cases**

In `tests/rls/matrix.test.ts`, inside the existing `describe.each([...])('cross-tenant deny as %s', …)` block, right after the existing `it('exchanges: cannot update exchange A', …)` (around line 67-70), add:

```ts
  it('exchanges: cannot write exchange A good-news template', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update exchanges set good_news_subject = 'pwned' where id = ${fx.exchangeA}`))
  })
```

- [ ] **Step 3: Add the RLS matrix allow case**

In the same file, inside `describe('own-school allow', …)`, right after the existing `it('organizer A can update their own exchange', …)` (around line 228-231), add:

```ts
  it('organizer A can write their own exchange good-news template', async () => {
    expect(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update exchanges set good_news_subject = 'Bonne nouvelle', good_news_body = 'Bonjour' where id = ${fx.exchangeA}`)).toBe(1)
  })
```

- [ ] **Step 4: Apply to staging, then prod, then regenerate types**

Follow the CLAUDE.md migration workflow exactly:
1. Staging: `set -a; source .env.staging; set +a; supabase db push --db-url "$STAGING_DB_URL"`
2. Prod: MCP `apply_migration` with `name = good_news_template`.
3. MCP `list_migrations` — if the stamped version differs from `20260719000001`, `git mv` the local file to the stamped version.
4. MCP `generate_typescript_types` → overwrite `types/supabase.ts` verbatim.

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS. If `types/db.ts` fails, fix the alias/narrowing there — never hand-edit `types/supabase.ts`.

- [ ] **Step 6: Run the RLS matrix**

Run: `pnpm test:rls`
Expected: PASS, including the three new/adjacent exchange cases.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/ tests/rls/matrix.test.ts types/supabase.ts types/db.ts
git commit -m "feat(db): add per-exchange good-news email template columns + RLS matrix cases"
```

---

## Task 2: `lib/good-news-template.ts` — defaults + `renderGoodNews`

**Files:**
- Create: `lib/good-news-template.ts`
- Test: `lib/__tests__/good-news-template.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_GOOD_NEWS_SUBJECT: string`, `DEFAULT_GOOD_NEWS_BODY: string`
  - `renderGoodNews(opts: { subject: string | null; body: string | null; studentName: string; exchangeName: string }): { subject: string; bodyHtml: string }`
    - `subject`: placeholders substituted, plain text (no HTML escaping — it is an email subject line). Falls back to `DEFAULT_GOOD_NEWS_SUBJECT` when `subject` is null/empty.
    - `bodyHtml`: placeholders substituted, then **HTML-escaped**, then `\n` → `<br>`. Falls back to `DEFAULT_GOOD_NEWS_BODY` when `body` is null/empty.
    - Placeholders: `{{student_name}}` and `{{exchange_name}}` only.

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/good-news-template.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  renderGoodNews,
  DEFAULT_GOOD_NEWS_SUBJECT,
  DEFAULT_GOOD_NEWS_BODY,
} from '@/lib/good-news-template'

describe('renderGoodNews', () => {
  const base = { studentName: 'Marie Dupont', exchangeName: 'France-Canada 2026' }

  it('substitutes both placeholders in subject and body', () => {
    const { subject, bodyHtml } = renderGoodNews({
      subject: 'Bravo {{student_name}} — {{exchange_name}}',
      body: 'Bonjour, la candidature de {{student_name}} pour {{exchange_name}} est retenue.',
      ...base,
    })
    expect(subject).toBe('Bravo Marie Dupont — France-Canada 2026')
    expect(bodyHtml).toContain('Marie Dupont')
    expect(bodyHtml).toContain('France-Canada 2026')
    expect(bodyHtml).not.toContain('{{student_name}}')
    expect(bodyHtml).not.toContain('{{exchange_name}}')
  })

  it('HTML-escapes organizer body and substituted values', () => {
    const { bodyHtml } = renderGoodNews({
      subject: null,
      body: 'Note <b>importante</b> pour {{student_name}}',
      studentName: '<script>x</script>',
      exchangeName: 'E',
    })
    expect(bodyHtml).toContain('&lt;b&gt;importante&lt;/b&gt;')
    expect(bodyHtml).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(bodyHtml).not.toContain('<b>')
    expect(bodyHtml).not.toContain('<script>')
  })

  it('converts newlines to <br> in the body', () => {
    const { bodyHtml } = renderGoodNews({ subject: null, body: 'ligne 1\nligne 2', ...base })
    expect(bodyHtml).toBe('ligne 1<br>ligne 2')
  })

  it('falls back to defaults when subject/body are null', () => {
    const { subject, bodyHtml } = renderGoodNews({ subject: null, body: null, ...base })
    // Default subject/body carry placeholders that must be substituted, not shown raw.
    expect(subject).toContain('Marie Dupont')
    expect(subject).toContain('France-Canada 2026')
    expect(subject).not.toContain('{{')
    expect(bodyHtml).toContain('Marie Dupont')
    expect(bodyHtml).not.toContain('{{')
  })

  it('falls back to defaults when subject/body are empty/whitespace', () => {
    const { subject, bodyHtml } = renderGoodNews({ subject: '   ', body: '\n', ...base })
    expect(subject).not.toBe('   ')
    expect(subject).toContain('Marie Dupont')
    expect(bodyHtml).not.toBe('')
  })

  it('the exported defaults contain both placeholders', () => {
    for (const t of [DEFAULT_GOOD_NEWS_SUBJECT, DEFAULT_GOOD_NEWS_BODY]) {
      expect(t).toContain('{{student_name}}')
      expect(t).toContain('{{exchange_name}}')
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- good-news-template`
Expected: FAIL — module `@/lib/good-news-template` not found.

- [ ] **Step 3: Implement `lib/good-news-template.ts`**

```ts
// Pure, unit-tested rendering of the per-exchange "Bonne nouvelle" parent email.
// Shared by BOTH the Settings authoring preview and the email renderer
// (lib/email.ts) so the two surfaces can never drift.
//
// Placeholders — the ONLY dynamic tokens an organizer may use:
//   {{student_name}}   {{exchange_name}}
// Everything else (dates, costs, links, passport warning, confirmation
// deadline) is identical for every family in the exchange and is typed
// literally into the body by the organizer.

export const DEFAULT_GOOD_NEWS_SUBJECT =
  'Bonne nouvelle — {{student_name}} est retenu·e pour {{exchange_name}} !'

export const DEFAULT_GOOD_NEWS_BODY = `Bonjour,

Nous avons le plaisir de vous annoncer que la candidature de {{student_name}} pour l'échange {{exchange_name}} a été retenue !

Cette confirmation vaudra engagement définitif de votre famille. Merci de bien vouloir prendre connaissance des informations suivantes :

• Dates du séjour : [à compléter]
• Participation aux frais : [à compléter]
• Adhésion / paiement : [lien ou modalités à compléter]
• Passeport : vérifiez que celui de votre enfant est valide au-delà de la date de retour.
• Date limite de confirmation : [à compléter]

Merci d'indiquer votre décision à l'aide des boutons ci-dessous.`

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function substitute(text: string, vars: { studentName: string; exchangeName: string }): string {
  return text
    .replaceAll('{{student_name}}', vars.studentName)
    .replaceAll('{{exchange_name}}', vars.exchangeName)
}

export function renderGoodNews(opts: {
  subject: string | null
  body: string | null
  studentName: string
  exchangeName: string
}): { subject: string; bodyHtml: string } {
  const rawSubject = (opts.subject ?? '').trim() || DEFAULT_GOOD_NEWS_SUBJECT
  const rawBody = (opts.body ?? '').trim() || DEFAULT_GOOD_NEWS_BODY
  const vars = { studentName: opts.studentName, exchangeName: opts.exchangeName }
  const subject = substitute(rawSubject, vars)
  // Substitute FIRST, then escape the whole string, so both organizer-authored
  // markup and any markup in the substituted names are neutralized.
  const bodyHtml = escapeHtml(substitute(rawBody, vars)).replace(/\n/g, '<br>')
  return { subject, bodyHtml }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- good-news-template`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/good-news-template.ts lib/__tests__/good-news-template.test.ts
git commit -m "feat(email): add shared good-news template renderer + defaults"
```

---

## Task 3: `lib/application-form.ts` — require `father_email` + `parentRecipients`

**Files:**
- Modify: `lib/application-form.ts`
- Test: `lib/__tests__/application-form.test.ts` (add cases)

**Interfaces:**
- Consumes: `applicantName` (existing).
- Produces: `parentRecipients(data: Record<string, string> | null | undefined, fallbackEmail: string): string[]` — the present parent emails (`father_email`, then `mother_email`), or `[fallbackEmail]` when neither is present.
- Side effect: `father_email` field gains `required: true` (so an application cannot be submitted without a parent recipient); `mother_email` stays optional.

- [ ] **Step 1: Write the failing tests**

In `lib/__tests__/application-form.test.ts`, add (import `parentRecipients` and `missingRequiredApplication` — check the existing import line and extend it):

```ts
import { parentRecipients } from '@/lib/application-form'

describe('parentRecipients', () => {
  it('returns both parent emails when present, father first', () => {
    expect(parentRecipients(
      { father_email: 'dad@x.fr', mother_email: 'mom@x.fr' }, 'student@x.fr',
    )).toEqual(['dad@x.fr', 'mom@x.fr'])
  })
  it('returns only the present parent email', () => {
    expect(parentRecipients({ father_email: 'dad@x.fr' }, 'student@x.fr')).toEqual(['dad@x.fr'])
    expect(parentRecipients({ mother_email: 'mom@x.fr' }, 'student@x.fr')).toEqual(['mom@x.fr'])
  })
  it('trims and ignores blank parent emails', () => {
    expect(parentRecipients({ father_email: '  ', mother_email: ' mom@x.fr ' }, 's@x.fr'))
      .toEqual(['mom@x.fr'])
  })
  it('falls back to the student email when no parent email is present', () => {
    expect(parentRecipients({}, 'student@x.fr')).toEqual(['student@x.fr'])
    expect(parentRecipients(null, 'student@x.fr')).toEqual(['student@x.fr'])
  })
})

describe('missingRequiredApplication — father_email is required', () => {
  it('flags a missing father_email even when the mother group is complete', () => {
    const data: Record<string, string> = {
      // minimal: leave father_email empty, fill nothing else parent-side
      father_email: '',
    }
    expect(missingRequiredApplication(data)).toContain('father_email')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- application-form`
Expected: FAIL — `parentRecipients` is not exported; the `father_email` assertion may already pass or fail depending on the group logic (the `parentRecipients` failures are the ones that must appear).

- [ ] **Step 3: Mark `father_email` required and add `parentRecipients`**

In `lib/application-form.ts`, change the `father_email` field (line 48) to add `required: true`:

```ts
      { id: 'father_email', type: 'email', group: 'father', label: L('Father — Email', 'Père — Email'), required: true },
```

Then append this function after `applicantName` (end of file):

```ts
// Good-news email recipients: the present parent emails (father first, mother
// second), or the student's own email as a last-resort fallback so an accept
// never silently fails to notify. Blank/whitespace parent values are ignored.
export function parentRecipients(
  data: Record<string, string> | null | undefined,
  fallbackEmail: string,
): string[] {
  const emails = [data?.father_email, data?.mother_email]
    .map((e) => (e ?? '').trim())
    .filter((e) => e.length > 0)
  return emails.length > 0 ? emails : [fallbackEmail]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- application-form`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/application-form.ts lib/__tests__/application-form.test.ts
git commit -m "feat(apply): require father_email + add parentRecipients helper"
```

---

## Task 4: `lib/email.ts` — `sendGoodNewsEmail` + `sendStudentSetupEmail`

**Files:**
- Modify: `lib/email.ts`, `lib/exchange-terms.ts`
- Test: `lib/__tests__/email.good-news.test.ts`

**Interfaces:**
- Consumes: `renderGoodNews` (Task 2); existing `layout`, `esc`, `send`, `APP_FOOTER_FR`, `STUDENT_FOOTER`, `EmailLogContext`.
- Produces:
  - `sendGoodNewsEmail(opts: { to: string[]; studentName: string; exchangeName: string; subject: string | null; body: string | null; respondUrl: string; language: 'en' | 'fr'; ctx?: EmailLogContext }): Promise<void>` — renders the template and appends three system-controlled link-buttons deep-linking to `${respondUrl}?r=yes|no|maybe`.
  - `sendStudentSetupEmail(opts: { to: string; exchangeName: string; setupUrl: string; ctx?: EmailLogContext }): Promise<void>`.
  - `send()` recipient widened to `string | string[]`.
- Also produces (Task 7 consumes): `EXCHANGE_TERMS_RESPOND_PARENT` in `lib/exchange-terms.ts`.

- [ ] **Step 1: Add the parent terms constant**

In `lib/exchange-terms.ts`, append after `EXCHANGE_TERMS_RESPOND`:

```ts
// Parent-facing respond-page variant (the parent's click is the family's
// definitive commitment and the terms acknowledgment).
export const EXCHANGE_TERMS_RESPOND_PARENT =
  `En confirmant la participation de votre enfant, vous reconnaissez ${EXCHANGE_TERMS_BODY}`
```

- [ ] **Step 2: Write the failing tests**

Create `lib/__tests__/email.good-news.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))

import { sendGoodNewsEmail, sendStudentSetupEmail } from '@/lib/email'

describe('sendGoodNewsEmail', () => {
  beforeEach(() => {
    sendMock.mockClear()
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('sends to the parent array with rendered subject/body and three deep-linked buttons (fr)', async () => {
    await sendGoodNewsEmail({
      to: ['dad@x.fr', 'mom@x.fr'],
      studentName: 'Marie Dupont',
      exchangeName: 'France-Canada 2026',
      subject: 'Bravo {{student_name}}',
      body: 'Candidature de {{student_name}} pour {{exchange_name}} retenue.',
      respondUrl: 'https://app.test/invite/tok123',
      language: 'fr',
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.to).toEqual(['dad@x.fr', 'mom@x.fr'])
    expect(call.subject).toBe('Bravo Marie Dupont')
    expect(call.html).toContain('Marie Dupont')
    expect(call.html).toContain('France-Canada 2026')
    // Three deep-linked buttons, GET links (no scripts in email).
    expect(call.html).toContain('https://app.test/invite/tok123?r=yes')
    expect(call.html).toContain('https://app.test/invite/tok123?r=no')
    expect(call.html).toContain('https://app.test/invite/tok123?r=maybe')
    // French button labels.
    expect(call.html).toContain('Oui, nous confirmons')
    expect(call.html).toContain('Oui, mais nous avons des questions')
  })

  it('escapes organizer body content', async () => {
    await sendGoodNewsEmail({
      to: ['dad@x.fr'], studentName: 'M', exchangeName: 'E',
      subject: null, body: 'Danger <img src=x> {{student_name}}',
      respondUrl: 'https://app.test/invite/t', language: 'fr',
    })
    const { html } = sendMock.mock.calls[0][0]
    expect(html).toContain('&lt;img src=x&gt;')
    expect(html).not.toContain('<img src=x>')
  })

  it('uses English button labels when language is en', async () => {
    await sendGoodNewsEmail({
      to: ['dad@x.fr'], studentName: 'M', exchangeName: 'E',
      subject: null, body: null,
      respondUrl: 'https://app.test/invite/t', language: 'en',
    })
    const { html } = sendMock.mock.calls[0][0]
    expect(html).toContain('Yes, we confirm')
    expect(html).toContain('Yes, but we have questions')
  })
})

describe('sendStudentSetupEmail', () => {
  beforeEach(() => {
    sendMock.mockClear()
    process.env.RESEND_API_KEY = 'test-key'
  })
  it('sends a French set-your-access email linking to the setup URL', async () => {
    await sendStudentSetupEmail({
      to: 'student@x.fr',
      exchangeName: 'France-Canada 2026',
      setupUrl: 'https://app.test/auth/confirm?token_hash=h&type=magiclink&next=%2Faccept-invite',
    })
    const { to, subject, html } = sendMock.mock.calls[0][0]
    expect(to).toBe('student@x.fr')
    expect(subject).toContain('France-Canada 2026')
    expect(html).toContain('https://app.test/auth/confirm?token_hash=h&amp;type=magiclink&amp;next=%2Faccept-invite')
    expect(html).toContain('Créer mon accès')
  })
})
```

> Note: the setup-URL assertion uses `&amp;` because an `href` value passing through the email HTML is written literally; `&` in the URL is not double-encoded by our code, so match the raw value your implementation emits. If your implementation does not escape the URL, assert the raw `&` form instead — keep the test matching the code you write in Step 3.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test -- email.good-news`
Expected: FAIL — `sendGoodNewsEmail` / `sendStudentSetupEmail` not exported.

- [ ] **Step 4: Widen `send()` and implement the two senders**

In `lib/email.ts`:

(a) Change the `send` signature and recipient logging (line 41 area) so it accepts arrays:

```ts
async function send(to: string | string[], subject: string, html: string, label: string, ctx?: EmailLogContext): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping ${label}`)
    return false
  }
  const recipient = Array.isArray(to) ? to.join(', ') : to
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html })
    if (error) {
      logSendError(label, error)
      await logEmailSend({
        recipient, kind: label, status: 'error',
        errorCode: (error as { statusCode?: number }).statusCode ?? null,
        ...ctx,
      })
      return false
    }
    await logEmailSend({ recipient, kind: label, status: 'sent', ...ctx })
    return true
  } catch {
    console.error(`[email] ${label} failed: send threw`)
    await logEmailSend({ recipient, kind: label, status: 'error', ...ctx })
    return false
  }
}
```

(b) Add the import for the template renderer at the top of the file (next to the other imports):

```ts
import { renderGoodNews } from '@/lib/good-news-template'
```

(c) Add the two senders. Place `sendGoodNewsEmail` right after `sendInvitationEmail`:

```ts
// System-controlled button labels, keyed by the applicant's language. NEVER part
// of the organizer-editable body — appended by the renderer so an organizer
// cannot break the response links.
const GOOD_NEWS_BUTTONS: Record<'en' | 'fr', { yes: string; no: string; maybe: string }> = {
  fr: { yes: 'Oui, nous confirmons', no: 'Non', maybe: 'Oui, mais nous avons des questions…' },
  en: { yes: 'Yes, we confirm', no: 'No', maybe: 'Yes, but we have questions…' },
}

export async function sendGoodNewsEmail(opts: {
  to: string[]
  studentName: string
  exchangeName: string
  subject: string | null
  body: string | null
  respondUrl: string
  language: 'en' | 'fr'
  ctx?: EmailLogContext
}): Promise<void> {
  const { subject, bodyHtml } = renderGoodNews({
    subject: opts.subject, body: opts.body,
    studentName: opts.studentName, exchangeName: opts.exchangeName,
  })
  const labels = GOOD_NEWS_BUTTONS[opts.language]
  const btn = (href: string, label: string, bg: string) =>
    `<a href="${href}" style="display:block;text-align:center;background:${bg};color:#fff;text-decoration:none;padding:12px 16px;border-radius:9px;margin-bottom:8px;font-weight:600;">${esc(label)}</a>`
  const buttons =
    btn(`${opts.respondUrl}?r=yes`, labels.yes, '#1F7A57') +
    btn(`${opts.respondUrl}?r=no`, labels.no, '#5C7268') +
    btn(`${opts.respondUrl}?r=maybe`, labels.maybe, '#2456E6')
  const html = layout(`${bodyHtml}<div style="margin-top:20px;">${buttons}</div>`, APP_FOOTER_FR)
  await send(opts.to, subject, html, 'good news email', opts.ctx)
}

export async function sendStudentSetupEmail(opts: {
  to: string
  exchangeName: string
  setupUrl: string
  ctx?: EmailLogContext
}): Promise<void> {
  const html = layout(`
    <p>Bonjour,</p>
    <p>Tes parents ont confirmé ta participation à <strong>${esc(opts.exchangeName)}</strong> — bravo ! Crée ton accès pour commencer ton dossier :</p>
    <p><a href="${opts.setupUrl}" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Créer mon accès</a></p>
  `, STUDENT_FOOTER)
  await send(opts.to, `Crée ton accès — ${opts.exchangeName}`, html, 'student setup email', opts.ctx)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- email.good-news`
Expected: PASS. (If the setup-URL assertion mismatches on `&` vs `&amp;`, align the test to what the code emits — the URL is inserted verbatim into the `href`.)

- [ ] **Step 6: Commit**

```bash
git add lib/email.ts lib/exchange-terms.ts lib/__tests__/email.good-news.test.ts
git commit -m "feat(email): add sendGoodNewsEmail + sendStudentSetupEmail; support array recipients"
```

---

## Task 5: `acceptApplication` sends the good-news email to parents

**Files:**
- Modify: `actions/applications-review.ts`
- Test: `actions/__tests__/bulk-applications.test.ts` (extend harness + cases)

**Interfaces:**
- Consumes: `sendGoodNewsEmail` (Task 4), `parentRecipients` (Task 3), `exchanges.good_news_subject/body` (Task 1), `app.language` / `app.data`.
- Behavior: unchanged status/token/audit; **replaces** `sendInvitationEmail(to: student)` with `sendGoodNewsEmail(to: parents, …)`.

- [ ] **Step 1: Write the failing tests**

In `actions/__tests__/bulk-applications.test.ts`:

(a) Extend the email mock (line ~65) to include `sendGoodNewsEmail`:

```ts
vi.mock('@/lib/email', () => ({
  sendApplicationResumeEmail: vi.fn(async () => {}),
  sendApplicationConfirmationEmail: vi.fn(async () => {}),
  sendNewApplicationAlertEmail: vi.fn(async () => {}),
  sendInvitationEmail: vi.fn(async () => {}),
  sendApplicationRejectionEmail: vi.fn(async () => {}),
  sendGoodNewsEmail: vi.fn(async () => {}),
}))
```

(b) Add imports below the existing `import { revalidatePath } …` / actions import:

```ts
import { sendGoodNewsEmail } from '@/lib/email'
import { acceptApplication } from '../applications-review'
```

(c) In `beforeEach`, extend the exchange fixture with the template columns and `language` on the app, and add a parent-email app:

```ts
    exchange: { id: 'ex-1', name: 'France-Canada', school_id: 's-1', good_news_subject: null, good_news_body: null },
    // ...
    applications: {
      'app-ok': { id: 'app-ok', exchange_id: 'ex-1', school_id: 's-1', status: 'submitted', email: 'stu@b.co', language: 'fr', data: { first_name: 'A', last_name: 'B', father_email: 'dad@b.co', mother_email: 'mom@b.co' } },
      'app-noparent': { id: 'app-noparent', exchange_id: 'ex-1', school_id: 's-1', status: 'submitted', email: 'stu2@b.co', language: 'fr', data: { first_name: 'C', last_name: 'D' } },
    },
```

(d) Add a new describe block:

```ts
describe('acceptApplication good-news email', () => {
  it('emails the parents (father + mother) with the rendered template', async () => {
    await acceptApplication('app-ok')
    expect(sendGoodNewsEmail).toHaveBeenCalledTimes(1)
    const arg = (sendGoodNewsEmail as any).mock.calls[0][0]
    expect(arg.to).toEqual(['dad@b.co', 'mom@b.co'])
    expect(arg.language).toBe('fr')
    expect(arg.respondUrl).toContain('/invite/')
  })

  it('falls back to the student email when no parent email is present', async () => {
    await acceptApplication('app-noparent')
    const arg = (sendGoodNewsEmail as any).mock.calls[0][0]
    expect(arg.to).toEqual(['stu2@b.co'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- bulk-applications`
Expected: FAIL — `acceptApplication` still calls `sendInvitationEmail`, and `arg.to` is a string, not the parent array.

- [ ] **Step 3: Update `acceptApplication`**

In `actions/applications-review.ts`:

(a) Change the email import (line 7):

```ts
import { sendGoodNewsEmail, sendApplicationRejectionEmail } from '@/lib/email'
```

(b) Add the `parentRecipients` import (extend line 5):

```ts
import { applicantName as buildApplicantName, parentRecipients } from '@/lib/application-form'
```

(c) Replace the email block at the end of `acceptApplication` (lines 131-138):

```ts
  const { data: exchange } = await supabase
    .from('exchanges')
    .select('name, good_news_subject, good_news_body')
    .eq('id', app.exchange_id).maybeSingle()
  const applicantName = buildApplicantName(app.data)
  const recipients = parentRecipients(app.data as Record<string, string>, app.email)
  void sendGoodNewsEmail({
    to: recipients,
    studentName: applicantName,
    exchangeName: exchange?.name ?? '',
    subject: exchange?.good_news_subject ?? null,
    body: exchange?.good_news_body ?? null,
    respondUrl: `${APP_URL}/invite/${inviteToken}`,
    language: app.language === 'fr' ? 'fr' : 'en',
    ctx: { schoolId: app.school_id, exchangeId: app.exchange_id },
  }).catch(() => {})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- bulk-applications`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add actions/applications-review.ts actions/__tests__/bulk-applications.test.ts
git commit -m "feat(review): acceptApplication emails parents with the good-news template"
```

---

## Task 6: `respondToInvitation` — parent Yes creates account + emails student, mints no parent session

**Files:**
- Modify: `actions/invitations.ts`
- Test: `actions/__tests__/applications.test.ts` (update the `respondToInvitation` suite + mocks)

**Interfaces:**
- Consumes: `sendStudentSetupEmail` (Task 4), `getAppUrl`.
- Behavior changes:
  - **Yes:** claim → create student account + enrollment + finalize `enrolled` (unchanged), stamp `terms_acknowledged_at` (the parent's click), keep the enrollment checklist email, **then email the STUDENT a setup link** (`generateLink` magiclink → `/auth/confirm?token_hash=…&type=magiclink&next=/accept-invite`). **Do NOT mint a parent session** (no `verifyOtp` on the caller's client). Return `{ ok: true }`.
  - **Idempotent recovery** (invite already `enrolling`/`enrolled` on a double-click / second parent): return `{ ok: true }` **without** re-creating the account or re-sending the student email — no session mint.
  - **Student setup email is best-effort** (like the checklist): a failed send logs a warning and still returns `{ ok: true }` — the family's confirmation already succeeded.
  - **No/Maybe:** unchanged.

**Design note (kept intentionally):** the student still receives the enrollment checklist email (fired at enrollment today) *and* the new setup email. Removing the checklist is out of scope for this change; both are best-effort.

- [ ] **Step 1: Update the test mocks and rewrite the Yes-path tests**

In `actions/__tests__/applications.test.ts`:

(a) Add `sendStudentSetupEmail` to the `@/lib/email` mock (line ~135):

```ts
vi.mock('@/lib/email', () => ({
  sendApplicationResumeEmail: vi.fn().mockResolvedValue(undefined),
  sendApplicationConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendNewApplicationAlertEmail: vi.fn().mockResolvedValue(undefined),
  sendInvitationEmail: vi.fn(), sendApplicationRejectionEmail: vi.fn(),
  sendChecklistEmail: vi.fn().mockResolvedValue(true),
  sendStudentSetupEmail: vi.fn().mockResolvedValue(undefined),
}))
```

(b) Import it for assertions (extend the `import … from '@/lib/email'` line ~147):

```ts
import { sendApplicationResumeEmail, sendStudentSetupEmail } from '@/lib/email'
```

(c) In the `describe('respondToInvitation', …)` block, **replace** the following existing tests with the versions below (the parent flow mints no session and emails the student):

Replace the `'on Yes creates a confirmed account …'` test (lines 406-414):

```ts
  it('on Yes creates a confirmed account, enrolls, finalizes, and emails the STUDENT a setup link (no parent session)', async () => {
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toEqual({ ok: true })
    expect(scenario.createUserAttrs).toMatchObject({ email: 'a@b.co', email_confirm: true })
    expect(scenario.updated.row.status).toBe('enrolled')
    expect(scenario.updated.row.enrolled_user_id).toBe('new-user')
    // A magiclink is generated to build the student's /auth/confirm setup URL...
    expect(scenario.generateLinkAttrs).toMatchObject({ type: 'magiclink', email: 'a@b.co' })
    // ...and mailed to the student — but the PARENT is never signed in here.
    expect(sendStudentSetupEmail).toHaveBeenCalledTimes(1)
    const arg = (sendStudentSetupEmail as any).mock.calls[0][0]
    expect(arg.to).toBe('a@b.co')
    expect(arg.setupUrl).toContain('/auth/confirm?token_hash=hash-1')
    expect(arg.setupUrl).toContain('type=magiclink')
    expect(arg.setupUrl).toContain('next=%2Faccept-invite')
    expect(scenario.verifyOtpAttrs).toBeNull()
  })
```

Replace the `'a Yes on an already-claimed (enrolling) invite …'` test (lines 415-421):

```ts
  it('a Yes on an already-claimed (enrolling) invite is idempotent — no second account, no resend', async () => {
    scenario.application.status = 'enrolling'
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toEqual({ ok: true })
    expect(scenario.createUserAttrs).toBeNull()
    expect(sendStudentSetupEmail).not.toHaveBeenCalled()
    expect(scenario.verifyOtpAttrs).toBeNull()
  })
```

Replace the `'a Yes on an already-enrolled invite …'` test (lines 422-427):

```ts
  it('a Yes on an already-enrolled invite is idempotent success', async () => {
    scenario.application.status = 'enrolled'
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toEqual({ ok: true })
    expect(scenario.createUserAttrs).toBeNull()
    expect(sendStudentSetupEmail).not.toHaveBeenCalled()
  })
```

**Delete** these two now-obsolete tests (they asserted parent session-mint / retry semantics that no longer exist on the accept path):
- `'returns the structured retry error when the session mint fails after enrollment'` (lines 428-434)
- `'a failing verifyOtp also returns the retry error'` (lines 435-439)

**Add** a best-effort test in their place:

```ts
  it('a failing student setup email does not fail the confirmation (best-effort)', async () => {
    scenario.generateLinkResult = { data: null, error: { message: 'boom' } }
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toEqual({ ok: true })
    // enrollment was still finalized
    expect(scenario.updates.some((u) => u.row.status === 'enrolled')).toBe(true)
  })
```

Keep unchanged: expired, No, Maybe, closed, email_exists, 23505, enroll-failure, terms-stamped, No/Maybe-no-terms tests.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- actions/__tests__/applications`
Expected: FAIL — the Yes path still mints a session (`verifyOtpAttrs` set), does not call `sendStudentSetupEmail`.

- [ ] **Step 3: Update `actions/invitations.ts`**

(a) Extend the email import (line 7) and add `getAppUrl`:

```ts
import { sendChecklistEmail, sendStudentSetupEmail } from '@/lib/email'
import { getAppUrl } from '@/lib/app-url'
```

(b) Add a module-level app URL constant near the top (after imports):

```ts
const APP_URL = getAppUrl()
```

(c) In the **claim-fail recovery branch** (lines 96-109), replace the session-mint with idempotent success:

```ts
  if (!claimed) {
    const { data: cur } = await admin
      .from('applications').select('status, email').eq('invite_token', token).maybeSingle()
    if (!cur) return inviteError('not_found')
    // A parallel request / the other parent already claimed (enrolling) or
    // finished (enrolled). The winning click already created the account and
    // emailed the student their setup link — this is idempotent success. We do
    // NOT sign the parent in and do NOT resend the student email.
    if (cur.status === 'enrolling' || cur.status === 'enrolled') return { ok: true }
    return inviteError('closed')
  }
```

(d) Replace the **finalize + checklist + session-mint tail** (lines 154-185, from the `enrolled` finalize down to the `return minted ? …`) with:

```ts
  // Account + enrollment exist. Finalize enrolling → enrolled (error-checked).
  const { error: finalErr } = await admin.from('applications')
    .update({ status: 'enrolled', enrolled_user_id: userId }).eq('id', claimed.id)
  if (finalErr) throw finalErr

  const studentName = buildApplicantName(claimed.data as Record<string, string> | null)

  // One checklist email at enrollment (best-effort — never breaks enrollment).
  await sendEnrollmentChecklist(admin, {
    userId,
    email: claimed.email,
    studentName,
    schoolId: claimed.school_id,
    exchangeId: claimed.exchange_id,
  })

  // Parent confirmed on behalf of the family: DO NOT mint a parent session.
  // Instead email the STUDENT a set-your-password link. Best-effort: a failed
  // send logs a warning but the confirmation itself already succeeded.
  await emailStudentSetupLink(admin, {
    email: claimed.email,
    schoolId: claimed.school_id,
    exchangeId: claimed.exchange_id,
  })

  return { ok: true }
```

(e) Add the new helper (place it near `sendEnrollmentChecklist`, after `mintInviteSession`):

```ts
// Emails the student a magiclink /auth/confirm setup URL (NOT a session in the
// parent's browser). generateLink returns a hashed OTP token without sending any
// email; we deliver it via Resend so app/auth/confirm/route.ts verifies it and
// lands the student on /accept-invite to set a password. Best-effort.
async function emailStudentSetupLink(
  admin: ReturnType<typeof createAdminClient>,
  opts: { email: string; schoolId: string; exchangeId: string },
): Promise<void> {
  try {
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: 'magiclink', email: opts.email,
    })
    const tokenHash = link?.properties?.hashed_token
    if (error || !tokenHash) {
      console.warn('[invitations] student setup link generation failed — no email sent')
      return
    }
    const setupUrl =
      `${APP_URL}/auth/confirm?token_hash=${tokenHash}&type=magiclink&next=${encodeURIComponent('/accept-invite')}`
    const { data: exchange } = await admin
      .from('exchanges').select('name').eq('id', opts.exchangeId).maybeSingle()
    await sendStudentSetupEmail({
      to: opts.email,
      exchangeName: exchange?.name ?? '',
      setupUrl,
      ctx: { schoolId: opts.schoolId, exchangeId: opts.exchangeId },
    })
  } catch {
    // Never log the student email (PII); the enrollment already succeeded.
    console.warn('[invitations] student setup email failed — enrollment unaffected')
  }
}
```

> `mintInviteSession` stays defined — it is still used by `resumeInviteSetup`. It is simply no longer called from the accept path.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- actions/__tests__/applications`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add actions/invitations.ts actions/__tests__/applications.test.ts
git commit -m "feat(invite): parent Yes emails student setup link, mints no parent session"
```

---

## Task 7: Parent-facing `/invite/[token]` page + `InviteResponseForm`

**Files:**
- Modify: `components/InviteResponseForm.tsx`, `app/invite/[token]/page.tsx`
- (No new test file — covered by the action tests in Task 6 + `pnpm build`/lint.)

**Interfaces:**
- Consumes: `respondToInvitation` (Task 6 behavior), `EXCHANGE_TERMS_RESPOND_PARENT` (Task 4).
- Behavior: page reads `?r=yes|no|maybe` and passes a `preselect` prop; the form is parent-facing, pre-selects the choice, reveals a questions textarea for Maybe, and shows distinct yes/no/maybe success states — Yes shows "Merci — votre enfant recevra un lien pour créer son accès." with **no navigation**.

- [ ] **Step 1: Rewrite `components/InviteResponseForm.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { respondToInvitation } from '@/actions/invitations'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EXCHANGE_TERMS_RESPOND_PARENT } from '@/lib/exchange-terms'

export function InviteResponseForm({ token, studentName, exchangeName, preselect }: {
  token: string
  studentName: string
  exchangeName: string
  preselect: 'yes' | 'no' | 'maybe' | null
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [showQuestions, setShowQuestions] = useState(preselect === 'maybe')
  const [result, setResult] = useState<'yes' | 'no' | 'maybe' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function respond(response: 'yes' | 'no' | 'maybe') {
    setBusy(true); setError(null)
    try {
      const res = await respondToInvitation(token, response, response === 'maybe' ? note : '')
      if (!res.ok) { setError(res.message); setBusy(false); return }
      setResult(response)
    } catch {
      // Unexpected failure only — prod redacts thrown messages, so never show them.
      setError('Une erreur est survenue. Réessayez.'); setBusy(false)
    }
  }

  if (result === 'yes') return <p className="text-[15px] leading-relaxed text-[#10203F]">Merci — votre enfant recevra un lien pour créer son accès.</p>
  if (result === 'no') return <p className="text-[15px] leading-relaxed text-[#10203F]">Merci de nous avoir prévenus. Nous souhaitons le meilleur à votre enfant.</p>
  if (result === 'maybe') return <p className="text-[15px] leading-relaxed text-[#10203F]">Merci — nous avons noté vos questions, l’organisateur reviendra vers vous.</p>

  return (
    <div className="flex flex-col gap-5">
      <div>
        <span className="mb-3.5 inline-flex rounded-full bg-[#DCF3E6] px-3 py-1 text-[13px] font-semibold text-[#0F7A3D]">Candidature acceptée 🎉</span>
        <h3 className="m-0 mb-2 font-display text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-[#10203F]">
          {studentName ? `${studentName} ` : 'Votre enfant '}est invité·e à l’échange {exchangeName} !
        </h3>
        <p className="m-0 text-[15.5px] leading-relaxed text-[#5B6B8C]">Confirmez-vous la participation de votre enfant ?</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <Button disabled={busy} onClick={() => respond('yes')} className="h-[50px] w-full rounded-[11px] bg-[#1F7A57] text-base font-semibold hover:bg-[#186445]">Oui, nous confirmons</Button>
        <p className="m-0 text-[12.5px] leading-normal text-[#5B6B8C]">{EXCHANGE_TERMS_RESPOND_PARENT}</p>
        <Button variant="outline" disabled={busy} onClick={() => respond('no')} className="h-[50px] w-full rounded-[11px] border-[#C4CDE0] text-base font-semibold">Non</Button>
      </div>
      <div className="flex flex-col gap-2.5 border-t border-[#E4E9F2] pt-[18px]">
        {showQuestions ? (
          <>
            <Textarea autoFocus placeholder="Vos questions pour l’organisateur…" value={note} onChange={e => setNote(e.target.value)} className="min-h-20 rounded-[10px] border-[#C4CDE0]" />
            <Button disabled={busy} onClick={() => respond('maybe')} className="h-[46px] w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">Envoyer mes questions</Button>
          </>
        ) : (
          <Button variant="ghost" disabled={busy} onClick={() => setShowQuestions(true)} className="self-start px-0 font-semibold text-[#5B6B8C] underline underline-offset-[3px] hover:bg-transparent hover:text-[#10203F]">Oui, mais nous avons des questions…</Button>
        )}
      </div>
      {error && <p className="text-sm text-[#C0392B]">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `app/invite/[token]/page.tsx`**

```tsx
import { getInvitation } from '@/actions/invitations'
import { InviteResponseForm } from '@/components/InviteResponseForm'
import { CenteredCard } from '@/components/auth/CenteredCard'
import { InvalidLinkState } from '@/components/InvalidLinkState'

// Reads live invitation state via the cookie-less admin client — force dynamic
// so the parent response page is never served stale.
export const dynamic = 'force-dynamic'

export default async function InvitePage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ r?: string }>
}) {
  const { token } = await params
  const { r } = await searchParams
  const preselect = r === 'yes' || r === 'no' || r === 'maybe' ? r : null
  const invite = await getInvitation(token)

  if (!invite) return (
    <InvalidLinkState
      title="Ce lien n’est plus valide"
      body="Il a peut-être expiré — c’est normal, les liens expirent pour protéger le dossier. Vérifiez l’adresse dans votre e-mail, ou demandez à l’organisateur de vous en renvoyer un nouveau."
    />
  )
  if (invite.expired) return (
    <InvalidLinkState
      title="Cette invitation a expiré"
      body="Contactez l’organisateur pour recevoir une nouvelle invitation."
    />
  )

  // Already confirmed (by a prior click or the other parent): parent-facing
  // success — the student has (or will shortly) receive their own setup link.
  // No session is minted here (this page is parent-facing).
  if (invite.status === 'enrolling' || invite.status === 'enrolled') return (
    <CenteredCard maxWidth={520}>
      <div className="flex flex-col gap-3">
        <h3 className="m-0 font-display text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-[#10203F]">Participation déjà confirmée</h3>
        <p className="m-0 text-[15.5px] leading-relaxed text-[#5B6B8C]">Merci — la participation à l’échange {invite.exchangeName} est confirmée. Votre enfant reçoit un lien par e-mail pour créer son accès.</p>
      </div>
    </CenteredCard>
  )

  const closed = !['accepted', 'maybe'].includes(invite.status)
  if (closed) return (
    <InvalidLinkState
      title="Cette invitation a déjà reçu une réponse"
      body="Une réponse a déjà été enregistrée. Si c’est une erreur, contactez l’organisateur."
    />
  )
  return (
    <CenteredCard maxWidth={520}>
      <InviteResponseForm token={token} studentName={(invite.applicantName ?? '').trim()} exchangeName={invite.exchangeName} preselect={preselect} />
    </CenteredCard>
  )
}
```

> The `InviteResumeCard` import is dropped from this page (its student-session recovery is unsafe on a parent-facing page). The component file and `resumeInviteSetup` action remain in the repo, unreferenced by this route.

- [ ] **Step 3: Verify lint, types, and build**

Run: `pnpm lint && pnpm build`
Expected: PASS (no unused-import errors; `searchParams` typed as a Promise per the App Router style already used for `params`).

- [ ] **Step 4: Commit**

```bash
git add components/InviteResponseForm.tsx app/invite/[token]/page.tsx
git commit -m "feat(invite): parent-facing response page with ?r= preselect"
```

---

## Task 8: `updateGoodNewsTemplate` server action + `ProgramInfo` extension

**Files:**
- Modify: `actions/settings.ts`
- Test: `actions/__tests__/settings-good-news.test.ts` (new)

**Interfaces:**
- Consumes: `DEFAULT_GOOD_NEWS_SUBJECT/BODY` (Task 2), `getScopedExchange` (existing), `assertExchangeWritable`.
- Produces:
  - `ProgramInfo` gains `goodNewsSubject: string` and `goodNewsBody: string` (resolved: stored value, else the default constant).
  - `updateGoodNewsTemplate(exchangeId: string, subject: string, body: string): Promise<SaveTemplateResult>` where `export type SaveTemplateResult = { ok: true } | { ok: false; message: string }`.
  - Validation is a **structured return**, not a throw: empty subject/body or over-limit returns `{ ok: false, message }`.

- [ ] **Step 1: Write the failing tests**

Create `actions/__tests__/settings-good-news.test.ts`. Mirror the mock shape of `bulk-applications.test.ts` (a chainable builder), scoped to what `updateGoodNewsTemplate` touches (`users` for the auth preamble, `exchanges` for scope check + update):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: { exchange: any; profile: any; updated: any }

function builder(table: string) {
  const b: any = {
    _f: {} as Record<string, any>,
    select: () => b,
    eq: (c: string, v: any) => { b._f[c] = v; return b },
    update: (row: any) => {
      const u: any = { eq: () => u, then: (r: any) => r({ error: null }) }
      scenario.updated = { table, row }
      return u
    },
    async single() {
      if (table === 'users') return { data: scenario.profile, error: null }
      return { data: scenario.exchange, error: null }
    },
    async maybeSingle() {
      if (table === 'users') return { data: scenario.profile, error: null }
      return { data: scenario.exchange, error: null }
    },
  }
  return b
}
const client = {
  from: (t: string) => builder(t),
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }))
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => null }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }))

import { updateGoodNewsTemplate } from '../settings'

beforeEach(() => {
  scenario = {
    exchange: { id: 'ex-1', name: 'E', year: 2026, archived_at: null, school_a_id: 's-1', school_b_id: null, good_news_subject: null, good_news_body: null },
    profile: { id: 'user-1', school_id: 's-1', role: 'organizer', org_role: 'owner', email: 'o@x.fr', full_name: 'O' },
    updated: null,
  }
})

describe('updateGoodNewsTemplate', () => {
  it('saves trimmed subject/body for an in-scope exchange', async () => {
    const res = await updateGoodNewsTemplate('ex-1', '  Bonjour {{student_name}}  ', '  Corps  ')
    expect(res).toEqual({ ok: true })
    expect(scenario.updated.table).toBe('exchanges')
    expect(scenario.updated.row.good_news_subject).toBe('Bonjour {{student_name}}')
    expect(scenario.updated.row.good_news_body).toBe('Corps')
  })
  it('returns a structured error (no throw) on empty subject', async () => {
    const res = await updateGoodNewsTemplate('ex-1', '   ', 'Corps')
    expect(res.ok).toBe(false)
  })
  it('returns a structured error on empty body', async () => {
    const res = await updateGoodNewsTemplate('ex-1', 'Sujet', '')
    expect(res.ok).toBe(false)
  })
  it('rejects an out-of-scope exchange', async () => {
    scenario.exchange.school_a_id = 'other'
    await expect(updateGoodNewsTemplate('ex-1', 'Sujet', 'Corps')).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- settings-good-news`
Expected: FAIL — `updateGoodNewsTemplate` not exported.

- [ ] **Step 3: Extend `ProgramInfo` + `getProgramInfo` and add the action**

In `actions/settings.ts`:

(a) Add the import:

```ts
import { DEFAULT_GOOD_NEWS_SUBJECT, DEFAULT_GOOD_NEWS_BODY } from '@/lib/good-news-template'
```

(b) Extend the `ProgramInfo` type (lines 284-288):

```ts
export type ProgramInfo = {
  id: string; name: string; year: number; archived: boolean
  enrolled: number; applications: number; earliestDeadline: string | null
  remindersEnabled: boolean; reminderCadence: ReminderCadence
  goodNewsSubject: string; goodNewsBody: string
}
```

(c) Extend `getScopedExchange`'s select (line 293-295) to include the new columns:

```ts
    .select('id, name, year, archived_at, school_a_id, school_b_id, reminders_enabled, reminder_cadence, good_news_subject, good_news_body')
```

(d) Extend the `getProgramInfo` return (lines 318-325) to resolve template values against the defaults:

```ts
  return {
    id: exchange.id, name: exchange.name, year: exchange.year,
    archived: !!exchange.archived_at,
    enrolled: enrolled ?? 0, applications: applications ?? 0,
    earliestDeadline: (firstDeadline?.deadline as string | null) ?? null,
    remindersEnabled: exchange.reminders_enabled ?? true,
    reminderCadence: (exchange.reminder_cadence ?? 'normale') as ReminderCadence,
    goodNewsSubject: (exchange.good_news_subject as string | null)?.trim() || DEFAULT_GOOD_NEWS_SUBJECT,
    goodNewsBody: (exchange.good_news_body as string | null)?.trim() || DEFAULT_GOOD_NEWS_BODY,
  }
```

(e) Add the result type + action at the end of the file:

```ts
export type SaveTemplateResult = { ok: true } | { ok: false; message: string }

const GOOD_NEWS_SUBJECT_MAX = 200
const GOOD_NEWS_BODY_MAX = 5000

export async function updateGoodNewsTemplate(
  exchangeId: string, subject: string, body: string,
): Promise<SaveTemplateResult> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx()
  const t = await getTranslations('organizer')
  await getScopedExchange(supabase, ctx.schoolId, exchangeId)
  await assertExchangeWritable(supabase, exchangeId)

  const s = subject.trim()
  const b = body.trim()
  // Expected validation outcomes travel as return values (prod redacts throws).
  if (!s) return { ok: false, message: t('settings.goodNews.errors.subjectEmpty') }
  if (!b) return { ok: false, message: t('settings.goodNews.errors.bodyEmpty') }
  if (s.length > GOOD_NEWS_SUBJECT_MAX || b.length > GOOD_NEWS_BODY_MAX) {
    return { ok: false, message: t('settings.goodNews.errors.tooLong') }
  }

  const { error } = await supabase
    .from('exchanges')
    .update({ good_news_subject: s, good_news_body: b })
    .eq('id', exchangeId)
  if (error) return { ok: false, message: t('settings.goodNews.errors.saveFailed') }

  revalidatePath('/settings')
  return { ok: true }
}
```

> `getScopedExchange` and `assertExchangeWritable` are already imported in `actions/settings.ts` — verify; `assertExchangeWritable` comes from `@/lib/exchange-guard` (add the import if missing: `import { assertExchangeWritable } from '@/lib/exchange-guard'`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- settings-good-news`
Expected: PASS. (The `getTranslations` mock returns the key string, so `res.ok` is what the assertions check.)

- [ ] **Step 5: Verify types compile (ProgramInfo consumers)**

Run: `npx tsc --noEmit`
Expected: PASS. (Task 9 adds the new `ProgramInfo` fields' UI consumer; until then nothing reads them, so no break.)

- [ ] **Step 6: Commit**

```bash
git add actions/settings.ts actions/__tests__/settings-good-news.test.ts
git commit -m "feat(settings): updateGoodNewsTemplate action + ProgramInfo template fields"
```

---

## Task 9: "Bonne nouvelle" authoring card + i18n keys

**Files:**
- Create: `components/settings/GoodNewsCard.tsx`
- Modify: `components/settings/SettingsView.tsx`
- Modify: `messages/{en,fr,es,it,de}.json`

**Interfaces:**
- Consumes: `updateGoodNewsTemplate` + `ProgramInfo` (Task 8), `renderGoodNews` + defaults (Task 2).
- Produces: the card mounted under `section === 'prog'`, next to `ReminderSettingsCard`.

- [ ] **Step 1: Add i18n keys to all five catalogs**

Add an `organizer.settings.goodNews` object to **each** of `messages/{en,fr,es,it,de}.json`, inside the existing `organizer.settings` object (a sibling of `program`). The tokens `{{student_name}}`/`{{exchange_name}}` are **NOT** in the message values (they are rendered as literal JSX in the component) to avoid ICU brace parsing.

`messages/fr.json` (reference catalog — parity is checked against fr):

```json
        "goodNews": {
          "heading": "E-mail « Bonne nouvelle » aux parents",
          "description": "Envoyé aux parents lorsque vous acceptez une candidature. Les boutons Oui / Non / Questions sont ajoutés automatiquement.",
          "subjectLabel": "Objet",
          "bodyLabel": "Message",
          "placeholdersLabel": "Balises disponibles :",
          "previewLabel": "Aperçu",
          "resetToDefault": "Rétablir le modèle par défaut",
          "saveButton": "Enregistrer",
          "savedNotice": "Modèle enregistré.",
          "errors": {
            "subjectEmpty": "L’objet ne peut pas être vide.",
            "bodyEmpty": "Le message ne peut pas être vide.",
            "tooLong": "Le modèle est trop long.",
            "saveFailed": "Le modèle n’a pas pu être enregistré. Réessayez."
          }
        },
```

`messages/en.json`:

```json
        "goodNews": {
          "heading": "Parent “Good news” email",
          "description": "Sent to the parents when you accept an application. The Yes / No / Questions buttons are added automatically.",
          "subjectLabel": "Subject",
          "bodyLabel": "Message",
          "placeholdersLabel": "Available placeholders:",
          "previewLabel": "Preview",
          "resetToDefault": "Reset to the default template",
          "saveButton": "Save",
          "savedNotice": "Template saved.",
          "errors": {
            "subjectEmpty": "The subject cannot be empty.",
            "bodyEmpty": "The message cannot be empty.",
            "tooLong": "The template is too long.",
            "saveFailed": "The template could not be saved. Please try again."
          }
        },
```

`messages/es.json`:

```json
        "goodNews": {
          "heading": "Correo «Buenas noticias» a los padres",
          "description": "Se envía a los padres cuando aceptas una candidatura. Los botones Sí / No / Preguntas se añaden automáticamente.",
          "subjectLabel": "Asunto",
          "bodyLabel": "Mensaje",
          "placeholdersLabel": "Etiquetas disponibles:",
          "previewLabel": "Vista previa",
          "resetToDefault": "Restablecer la plantilla predeterminada",
          "saveButton": "Guardar",
          "savedNotice": "Plantilla guardada.",
          "errors": {
            "subjectEmpty": "El asunto no puede estar vacío.",
            "bodyEmpty": "El mensaje no puede estar vacío.",
            "tooLong": "La plantilla es demasiado larga.",
            "saveFailed": "No se pudo guardar la plantilla. Inténtalo de nuevo."
          }
        },
```

`messages/it.json`:

```json
        "goodNews": {
          "heading": "E-mail «Buona notizia» ai genitori",
          "description": "Inviata ai genitori quando accetti una candidatura. I pulsanti Sì / No / Domande vengono aggiunti automaticamente.",
          "subjectLabel": "Oggetto",
          "bodyLabel": "Messaggio",
          "placeholdersLabel": "Segnaposto disponibili:",
          "previewLabel": "Anteprima",
          "resetToDefault": "Ripristina il modello predefinito",
          "saveButton": "Salva",
          "savedNotice": "Modello salvato.",
          "errors": {
            "subjectEmpty": "L’oggetto non può essere vuoto.",
            "bodyEmpty": "Il messaggio non può essere vuoto.",
            "tooLong": "Il modello è troppo lungo.",
            "saveFailed": "Impossibile salvare il modello. Riprova."
          }
        },
```

`messages/de.json`:

```json
        "goodNews": {
          "heading": "„Gute Nachricht“-E-Mail an die Eltern",
          "description": "Wird an die Eltern gesendet, wenn Sie eine Bewerbung annehmen. Die Schaltflächen Ja / Nein / Fragen werden automatisch hinzugefügt.",
          "subjectLabel": "Betreff",
          "bodyLabel": "Nachricht",
          "placeholdersLabel": "Verfügbare Platzhalter:",
          "previewLabel": "Vorschau",
          "resetToDefault": "Auf Standardvorlage zurücksetzen",
          "saveButton": "Speichern",
          "savedNotice": "Vorlage gespeichert.",
          "errors": {
            "subjectEmpty": "Der Betreff darf nicht leer sein.",
            "bodyEmpty": "Die Nachricht darf nicht leer sein.",
            "tooLong": "Die Vorlage ist zu lang.",
            "saveFailed": "Die Vorlage konnte nicht gespeichert werden. Bitte erneut versuchen."
          }
        },
```

> Insert each block as a sibling key of `"program"` inside `organizer.settings`. Mind trailing commas — `program` is followed by `errors` in `fr.json`; place `goodNews` before `errors` with correct commas. Run the parity test in Step 4 to confirm the key sets match.

- [ ] **Step 2: Create `components/settings/GoodNewsCard.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { updateGoodNewsTemplate } from '@/actions/settings'
import {
  renderGoodNews,
  DEFAULT_GOOD_NEWS_SUBJECT,
  DEFAULT_GOOD_NEWS_BODY,
} from '@/lib/good-news-template'

export function GoodNewsCard({ exchangeId, exchangeName, initialSubject, initialBody, readOnly }: {
  exchangeId: string
  exchangeName: string
  initialSubject: string
  initialBody: string
  readOnly: boolean
}) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState(initialBody)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Live preview with a representative student so the organizer sees the result.
  const preview = renderGoodNews({
    subject, body, studentName: 'Marie Dupont', exchangeName,
  })

  async function save() {
    setBusy(true); setError(null); setSaved(false)
    try {
      const res = await updateGoodNewsTemplate(exchangeId, subject, body)
      if (!res.ok) { setError(res.message); setBusy(false); return }
      setSaved(true)
    } catch {
      setError(c('errors.generic'))
    }
    setBusy(false)
  }

  const disabled = busy || readOnly

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-1 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">{t('settings.goodNews.heading')}</div>
      <p className="m-0 mb-4 text-[12.5px] leading-normal text-muted-foreground">{t('settings.goodNews.description')}</p>

      <p className="mb-3 text-[12.5px] text-muted-foreground">
        {t('settings.goodNews.placeholdersLabel')}{' '}
        <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[12px] text-foreground">{'{{student_name}}'}</code>{' '}
        <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[12px] text-foreground">{'{{exchange_name}}'}</code>
      </p>

      <label className="mb-1 block text-[12.5px] font-semibold text-foreground">{t('settings.goodNews.subjectLabel')}</label>
      <input
        value={subject} disabled={disabled}
        onChange={e => { setSubject(e.target.value); setSaved(false) }}
        maxLength={200}
        className="mb-4 w-full rounded-[10px] border px-3.5 py-2.5 text-[13.5px] disabled:opacity-60"
      />

      <label className="mb-1 block text-[12.5px] font-semibold text-foreground">{t('settings.goodNews.bodyLabel')}</label>
      <textarea
        value={body} disabled={disabled}
        onChange={e => { setBody(e.target.value); setSaved(false) }}
        maxLength={5000} rows={12}
        className="mb-2 w-full rounded-[10px] border px-3.5 py-2.5 font-mono text-[12.5px] leading-relaxed disabled:opacity-60"
      />

      {!readOnly && (
        <button
          type="button" onClick={() => { setSubject(DEFAULT_GOOD_NEWS_SUBJECT); setBody(DEFAULT_GOOD_NEWS_BODY); setSaved(false) }}
          className="mb-4 text-[12px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t('settings.goodNews.resetToDefault')}
        </button>
      )}

      <div className="mb-4 rounded-xl border border-subtle bg-subtle/40 p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-tertiary">{t('settings.goodNews.previewLabel')}</div>
        <div className="mb-2 text-[13px] font-semibold text-foreground">{preview.subject}</div>
        <div className="text-[13px] leading-relaxed text-muted-foreground" dangerouslySetInnerHTML={{ __html: preview.bodyHtml }} />
        <div className="mt-3 flex flex-col gap-1.5">
          <span className="rounded-[9px] bg-[#1F7A57] px-3 py-2 text-center text-[12.5px] font-semibold text-white">Oui, nous confirmons</span>
          <span className="rounded-[9px] bg-[#5C7268] px-3 py-2 text-center text-[12.5px] font-semibold text-white">Non</span>
          <span className="rounded-[9px] bg-[#2456E6] px-3 py-2 text-center text-[12.5px] font-semibold text-white">Oui, mais nous avons des questions…</span>
        </div>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-3">
          <button
            type="button" disabled={disabled} onClick={save}
            className="rounded-[9px] bg-tint-text px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {t('settings.goodNews.saveButton')}
          </button>
          {saved && <span className="text-[12.5px] font-medium text-tint-text">{t('settings.goodNews.savedNotice')}</span>}
        </div>
      )}
      {error && <p className="mt-2 text-[12.5px] font-medium text-danger-text">{error}</p>}
    </div>
  )
}
```

> The preview renders escaped body HTML from the pure renderer (`dangerouslySetInnerHTML` is safe here: `renderGoodNews` HTML-escapes all content and only introduces `<br>`). The preview buttons are static labels — the real labels are appended by `sendGoodNewsEmail`.

- [ ] **Step 3: Mount the card in `SettingsView.tsx`**

(a) Add the import next to `ReminderSettingsCard`:

```ts
import { GoodNewsCard } from './GoodNewsCard'
```

(b) In the `section === 'prog'` block, add the card after `ReminderSettingsCard`:

```tsx
          {section === 'prog' && props.program && (
            <>
              <ProgramCard program={props.program} isOwner={props.isOwner} />
              <ReminderSettingsCard
                exchangeId={props.program.id}
                initialEnabled={props.program.remindersEnabled}
                initialCadence={props.program.reminderCadence}
                readOnly={props.program.archived}
              />
              <GoodNewsCard
                exchangeId={props.program.id}
                exchangeName={props.program.name}
                initialSubject={props.program.goodNewsSubject}
                initialBody={props.program.goodNewsBody}
                readOnly={props.program.archived}
              />
            </>
          )}
```

- [ ] **Step 4: Verify parity, lint, types, build**

Run: `pnpm test -- parity && pnpm lint && pnpm build`
Expected: PASS — all five catalogs share the same key set with non-empty values; no type errors.

- [ ] **Step 5: Commit**

```bash
git add components/settings/GoodNewsCard.tsx components/settings/SettingsView.tsx messages/
git commit -m "feat(settings): Bonne nouvelle template authoring card + i18n"
```

---

## Task 10: Surface `maybe` questions on the candidate detail card

**Files:**
- Modify: `components/applications/ApplicationDetail.tsx`
- Modify: `messages/{en,fr,es,it,de}.json`

**Interfaces:**
- Consumes: `application.invite_response_note`, `application.status`.
- Behavior: when `status === 'maybe'` and `invite_response_note` is present, render the questions block (today the note only renders for `submitted` via `ApplicationReviewActions`, so `maybe` questions are invisible).

- [ ] **Step 1: Add the i18n key to all five catalogs**

Add `"questionsHeading"` inside the existing `organizer.applications` object of each `messages/*.json`:

- `fr.json`: `"questionsHeading": "Questions de la famille"`
- `en.json`: `"questionsHeading": "Family’s questions"`
- `es.json`: `"questionsHeading": "Preguntas de la familia"`
- `it.json`: `"questionsHeading": "Domande della famiglia"`
- `de.json`: `"questionsHeading": "Fragen der Familie"`

> Locate the `organizer.applications` object (it already holds `backLink`, `subtitle`) and add the key with correct commas.

- [ ] **Step 2: Render the questions block**

In `components/applications/ApplicationDetail.tsx`, add — after the `ApplicationReadView` card `</div>` (line 45) and before the `status === 'submitted'` block:

```tsx
      {application.status === 'maybe' && application.invite_response_note && (
        <div data-noprint className="mt-6 rounded-card border bg-card p-6">
          <h2 className="mb-2 font-display text-sm font-semibold text-foreground">
            {tr('organizer.applications.questionsHeading')}
          </h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {application.invite_response_note}
          </p>
        </div>
      )}
```

- [ ] **Step 3: Verify parity, lint, build**

Run: `pnpm test -- parity && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/applications/ApplicationDetail.tsx messages/
git commit -m "feat(applications): show family questions for maybe responses"
```

---

## Final verification (whole feature)

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: all PASS.

- [ ] **Step 2: RLS matrix**

Run: `pnpm test:rls`
Expected: PASS (new exchange good-news cases green).

- [ ] **Step 3: Manual walk-through on staging** (previews hit staging; no real email — sends degrade to console warnings, so verify recipients/URLs from logs):
  1. Under Settings → Programme, edit the "Bonne nouvelle" template; confirm the live preview substitutes `{{student_name}}` / `{{exchange_name}}` and shows the three appended buttons; Save persists.
  2. Accept an application; from logs confirm the good-news email targets `father_email` (+`mother_email`), with correct substitution and `?r=yes|no|maybe` deep links (and student-email fallback when no parent email).
  3. Open `/invite/[token]?r=yes` → "Oui, nous confirmons" → parent success copy; from logs confirm a **student setup email** to the applicant with a `/auth/confirm?...&next=/accept-invite` URL, and **no parent session** was minted.
  4. Follow the student setup URL → lands logged-in on `/accept-invite` to set a password.
  5. Open `/invite/[token]?r=maybe` → submit questions → confirm they appear on the candidate detail card (status `maybe`).

---

## Self-Review (performed against the spec)

**Spec coverage:**
- Data model: `good_news_subject/body` nullable columns + RLS matrix + staging-first types workflow → Task 1. `father_email` required, `mother_email` optional → Task 3.
- Template authoring (Settings → Programme, placeholders, preview, system-appended buttons) → Tasks 8–9.
- Shared pure renderer `renderGoodNews` + defaults, unit-tested → Task 2.
- `updateGoodNewsTemplate` structured returns, RLS-scoped → Task 8.
- Email to parents with recipient selection + fallback; buttons deep-link to `?r=…`; escape organizer content; no PII logs → Tasks 4–5.
- Parent response → student onboarding (Yes: account + enrollment + terms stamp + student setup email, no parent session; No/Maybe unchanged; idempotency guards) → Task 6.
- Parent-facing `/invite` page + form, `?r=` preselect, distinct success states → Task 7.
- Organizer review of questions for `maybe` → Task 10.
- Verification (unit, lint/test/build, rls, staging manual) → per-task + Final.

**Placeholder scan:** no TBD/TODO/"handle edge cases"/"similar to Task N" — every code step carries complete code.

**Type consistency:** `renderGoodNews({subject,body,studentName,exchangeName}) → {subject,bodyHtml}` is defined in Task 2 and consumed with those exact names in Tasks 4 and 9. `sendGoodNewsEmail`/`sendStudentSetupEmail` signatures defined in Task 4 match their calls in Tasks 5 and 6. `parentRecipients(data, fallbackEmail)` defined in Task 3, called in Task 5. `ProgramInfo.goodNewsSubject/goodNewsBody` defined in Task 8, consumed in Task 9. `SaveTemplateResult` returned by Task 8, consumed in Task 9. `preselect: 'yes'|'no'|'maybe'|null` produced by Task 7 page, consumed by Task 7 form.

**Known judgment calls (flagged for the executor/reviewer):**
- The student receives both the existing enrollment checklist email and the new setup email; removing the checklist is out of scope.
- The student setup email is best-effort (matches the codebase email philosophy); a failed send does not fail the parent's confirmation.
- `resumeInviteSetup`/`InviteResumeCard` remain in the repo but are no longer wired into the now-parent-facing `/invite` page (their student-session mint would be unsafe there).
