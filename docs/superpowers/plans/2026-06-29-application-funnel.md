# Phase 1 Application Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an account-free public application funnel in front of the existing invite/enrollment machinery — students apply, organizers review and accept, accepted candidates answer Yes/No/Maybe, and a "Yes" creates the account and enrolls them into the existing Phase 2 forms flow.

**Architecture:** A new `applications` table holds anonymous submissions (answers in a JSONB `data` column). The public paths (start draft, autosave, submit, resume, respond-to-invite, photo upload) run through service-role server actions keyed by per-stage secret tokens — the same pattern as `inviteStudent`/`provisionOrganizer` — because there is no authenticated user. Organizer read/review paths use the normal RLS-enforced client with new school-scoped policies. A "Yes" response reuses the existing `inviteUserByEmail` → profile-insert → enrollment path verbatim, so the existing `trg_assign_on_enrollment_insert` trigger auto-assigns Phase 2 forms with zero changes.

**Tech Stack:** Next.js 14 (App Router, Server Actions), Supabase (Postgres + RLS + Auth + Storage), Resend, Tailwind + shadcn/ui, vitest.

## Global Constraints

- Package manager is **pnpm**, never npm.
- **`pnpm build` fails locally** (placeholder `.env.local`). Verify with `pnpm test`, `pnpm lint`, and `npx tsc --noEmit`. Never claim build success locally.
- Migrations live in `supabase/migrations/` named `YYYYMMDDNNNNNN_*.sql`. Use the `20260629…` prefix. Applied with `supabase db push` (deploy-time; needs the linked project + network).
- `types/db.ts` is **hand-maintained** — update it in the same task as any schema change.
- **All user-supplied content must be escaped in email HTML** via `esc()` in `lib/email.ts`.
- **Never log student/parent PII** — no applicant/student emails, names, or answers in `console.*`, errors, or analytics.
- RLS: no recursive/self-referential policies. New authenticated access needs a migration. Service-role (`createAdminClient`) is only used in server actions (never client) and only for the unauthenticated public paths, mirroring `inviteStudent`/`provisionOrganizer`.
- Email sends are fire-and-forget: a Resend failure must never roll back or throw out of the action (log a non-PII message and continue), matching `sendRejectionEmail`.
- Tests: vitest. Mock `@/lib/supabase/server` (and `@/lib/supabase/admin` where used) with a chainable builder; mock `next/cache`. Pure helpers are tested directly.

---

## File structure

**Create:**
- `supabase/migrations/20260629000001_applications.sql` — table, `exchanges` columns, RLS, slug backfill.
- `supabase/migrations/20260629000002_application_photos_bucket.sql` — private storage bucket.
- `lib/tokens.ts` — `randomToken()`, `applySlug()`.
- `lib/application-form.ts` — the fixed bilingual field catalog + validation helpers.
- `actions/applications.ts` — all application server actions (public + organizer).
- `components/ApplicationStartForm.tsx` — email+name "start" form (client).
- `components/ApplicationForm.tsx` — the full multi-section form with autosave + photo (client).
- `components/InviteResponseForm.tsx` — Yes/No/Maybe responder (client).
- `components/ApplicationReadView.tsx` — organizer read-only render of answers (server-friendly).
- `components/ApplicationReviewActions.tsx` — organizer Accept/Reject controls (client).
- `components/ApplicationsCard.tsx` — Phase 1 card for the exchange page (client; copy link + open toggle).
- `app/apply/[slug]/page.tsx` — public start page (open/closed gate).
- `app/apply/resume/[token]/page.tsx` — public resume/fill page.
- `app/invite/[token]/page.tsx` — public invitation response page.
- `app/(organizer)/exchanges/[id]/applications/page.tsx` — applications list.
- `app/(organizer)/exchanges/[id]/applications/[applicationId]/page.tsx` — application detail + review.
- Tests: `lib/__tests__/tokens.test.ts`, `lib/__tests__/application-form.test.ts`, `actions/__tests__/applications.test.ts`, `lib/__tests__/email.application.test.ts`.

**Modify:**
- `types/db.ts` — `Application` type, `ApplicationStatus`, `Exchange` columns, `Database.Tables.applications`.
- `lib/email.ts` — generalize `layout()`; add five application emails.
- `actions/exchanges.ts` — generate `apply_slug` on create; add `setApplicationOpen`.
- `middleware.ts` — make `/apply` and `/invite` public.
- `app/(organizer)/exchanges/[id]/page.tsx` — render `ApplicationsCard` (Phase 1) above the existing grid (Phase 2).

---

## Task 1: Schema — applications table, exchange columns, RLS

**Files:**
- Create: `supabase/migrations/20260629000001_applications.sql`
- Modify: `types/db.ts`

**Interfaces:**
- Produces (DB): table `applications` with columns per the spec; `exchanges.application_open boolean`, `exchanges.application_deadline date`, `exchanges.apply_slug text unique`.
- Produces (TS): `ApplicationStatus`, `Application` types; `Exchange` gains `application_open: boolean; application_deadline: string | null; apply_slug: string`; `Database.Tables.applications`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260629000001_applications.sql`:

```sql
-- Phase 1 application funnel. Applications are submitted anonymously (no auth
-- user) via service-role server actions keyed by secret tokens, mirroring the
-- inviteStudent/provisionOrganizer pattern. Organizers read/review their own
-- school's applications through RLS-enforced policies below.

-- Exchange-level controls for the public application link.
alter table exchanges add column if not exists application_open boolean not null default false;
alter table exchanges add column if not exists application_deadline date;
alter table exchanges add column if not exists apply_slug text unique;

-- Backfill a slug for existing exchanges so their public link resolves.
update exchanges
set apply_slug = lower(regexp_replace(coalesce(name, 'exchange'), '[^a-zA-Z0-9]+', '-', 'g'))
                 || '-' || substr(md5(id::text), 1, 8)
where apply_slug is null;

create table applications (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references exchanges(id) on delete cascade,
  school_id uuid not null references schools(id),
  email text not null,
  resume_token text not null unique,
  invite_token text unique,
  status text not null default 'draft'
    check (status in ('draft','submitted','rejected','accepted','declined','maybe','enrolled')),
  data jsonb not null default '{}'::jsonb,
  photo_path text,
  language text not null default 'en' check (language in ('en','fr')),
  invite_response text check (invite_response in ('yes','no','maybe')),
  invite_response_note text,
  responded_at timestamptz,
  enrolled_user_id uuid references users(id),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewer_id uuid references users(id),
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index applications_exchange_idx on applications(exchange_id);
create index applications_school_idx on applications(school_id);

alter table applications enable row level security;

-- Organizers read/update only their own school's applications. No INSERT policy:
-- the public draft/submit path writes via the service-role client, and organizers
-- never create applications directly.
create policy "organizers read school applications" on applications for select
  using (my_role() = 'organizer' and school_id = my_school_id());
create policy "organizers update school applications" on applications for update
  using (my_role() = 'organizer' and school_id = my_school_id());

create trigger applications_set_updated_at
  before update on applications
  for each row execute function set_updated_at();
```

NOTE: if `set_updated_at()` does not already exist in the schema, check
`supabase/migrations/20260624000001_initial_schema.sql`. If `submissions` uses a
different updated-at mechanism, drop the trigger block and instead set
`updated_at` explicitly in the server actions. Verify before assuming.

- [ ] **Step 2: Verify `set_updated_at()` exists**

Run: `grep -rn "set_updated_at\|updated_at" supabase/migrations/20260624000001_initial_schema.sql`
Expected: shows whether a shared updated-at trigger function exists. If it does NOT, remove the `create trigger applications_set_updated_at` block from the migration (the actions will set `updated_at` manually).

- [ ] **Step 3: Update `types/db.ts`**

Add near the other status unions (after line 3):

```typescript
export type ApplicationStatus =
  | 'draft' | 'submitted' | 'rejected' | 'accepted' | 'declined' | 'maybe' | 'enrolled'
```

Replace the `Exchange` type with:

```typescript
export type Exchange = {
  id: string; name: string; year: number
  school_a_id: string; school_b_id: string; created_at: string
  application_open: boolean
  application_deadline: string | null
  apply_slug: string
}
```

Add the `Application` type after `DocumentUpload`:

```typescript
export type Application = {
  id: string; exchange_id: string; school_id: string
  email: string; resume_token: string; invite_token: string | null
  status: ApplicationStatus
  data: Record<string, string>
  photo_path: string | null; language: 'en' | 'fr'
  invite_response: 'yes' | 'no' | 'maybe' | null
  invite_response_note: string | null; responded_at: string | null
  enrolled_user_id: string | null
  submitted_at: string | null; reviewed_at: string | null
  reviewer_id: string | null; review_note: string | null
  created_at: string; updated_at: string
}
```

Add to `Database.Tables` (after `document_uploads`):

```typescript
      applications: TableDef<Application, Omit<Application, 'id' | 'created_at' | 'updated_at'>, Partial<Application>>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). The `Exchange` change may surface call sites that construct exchanges — none should, since inserts omit these columns.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260629000001_applications.sql types/db.ts
git commit -m "feat(db): applications table, exchange application columns, RLS"
```

---

## Task 2: Token + slug helpers

**Files:**
- Create: `lib/tokens.ts`
- Test: `lib/__tests__/tokens.test.ts`

**Interfaces:**
- Produces: `randomToken(bytes?: number): string` (URL-safe), `applySlug(name: string): string`.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/tokens.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { randomToken, applySlug } from '../tokens'

describe('randomToken', () => {
  it('is URL-safe and unique', () => {
    const a = randomToken()
    const b = randomToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a.length).toBeGreaterThan(20)
  })
})

describe('applySlug', () => {
  it('slugifies the name and appends a random suffix', () => {
    const slug = applySlug('France-Canada 2026!')
    expect(slug).toMatch(/^france-canada-2026-[0-9a-f]{8}$/)
  })
  it('falls back when name has no usable characters', () => {
    expect(applySlug('!!!')).toMatch(/^exchange-[0-9a-f]{8}$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tokens`
Expected: FAIL — cannot find module `../tokens`.

- [ ] **Step 3: Write the implementation**

Create `lib/tokens.ts`:

```typescript
import { randomBytes } from 'crypto'

// URL-safe secret for resume/invite links. 24 bytes ≈ 32 base64url chars.
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url')
}

// Public apply-link slug: slugified name + short random suffix for uniqueness.
export function applySlug(name: string): string {
  const base = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${base || 'exchange'}-${randomBytes(4).toString('hex')}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tokens`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tokens.ts lib/__tests__/tokens.test.ts
git commit -m "feat: token + apply-slug helpers"
```

---

## Task 3: Application field catalog + validation

**Files:**
- Create: `lib/application-form.ts`
- Test: `lib/__tests__/application-form.test.ts`

**Interfaces:**
- Produces:
  - `type AppFieldType = 'text' | 'textarea' | 'date' | 'email' | 'tel' | 'yesno' | 'radio'`
  - `interface AppField { id: string; type: AppFieldType; label: { en: string; fr: string }; required?: boolean; group?: 'father' | 'mother'; options?: { value: string; label: { en: string; fr: string } }[] }`
  - `interface AppSection { id: string; title: { en: string; fr: string }; fields: AppField[] }`
  - `APPLICATION_SECTIONS: AppSection[]`
  - `allApplicationFields(): AppField[]`
  - `requiredApplicationFieldIds(): string[]`
  - `missingRequiredApplication(data: Record<string,string>): string[]`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/application-form.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  APPLICATION_SECTIONS, allApplicationFields,
  requiredApplicationFieldIds, missingRequiredApplication,
} from '../application-form'

describe('application catalog', () => {
  it('has four sections with stable ids', () => {
    expect(APPLICATION_SECTIONS.map(s => s.id)).toEqual([
      'student', 'parents', 'hosting', 'profile',
    ])
  })
  it('every field has unique id and both labels', () => {
    const ids = allApplicationFields().map(f => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of allApplicationFields()) {
      expect(f.label.en.length).toBeGreaterThan(0)
      expect(f.label.fr.length).toBeGreaterThan(0)
    }
  })
  it('includes the applicant email + photo-adjacent core fields as required', () => {
    expect(requiredApplicationFieldIds()).toEqual(
      expect.arrayContaining(['last_name', 'first_name', 'email', 'date_of_birth']),
    )
  })
})

describe('missingRequiredApplication', () => {
  it('lists required fields with empty/whitespace answers', () => {
    const missing = missingRequiredApplication({ first_name: 'Ana', last_name: '  ' })
    expect(missing).toContain('last_name')
    expect(missing).not.toContain('first_name')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- application-form`
Expected: FAIL — cannot find module `../application-form`.

- [ ] **Step 3: Write the catalog**

Create `lib/application-form.ts`. Mirrors the AGESSIA sample (`docs/Agessia Edina 2026-27 EXCHANGE Application Rev 2 (2).pdf`). `yesno` stores `'yes'`/`'no'`; `radio` stores the option `value`.

```typescript
export type AppFieldType = 'text' | 'textarea' | 'date' | 'email' | 'tel' | 'yesno' | 'radio'

export interface AppField {
  id: string
  type: AppFieldType
  label: { en: string; fr: string }
  required?: boolean
  group?: 'father' | 'mother'
  options?: { value: string; label: { en: string; fr: string } }[]
}

export interface AppSection {
  id: string
  title: { en: string; fr: string }
  fields: AppField[]
}

const L = (en: string, fr: string) => ({ en, fr })

export const APPLICATION_SECTIONS: AppSection[] = [
  {
    id: 'student',
    title: L('Student', 'Élève'),
    fields: [
      { id: 'last_name', type: 'text', label: L('Last name', 'Nom'), required: true },
      { id: 'first_name', type: 'text', label: L('First name', 'Prénom'), required: true },
      { id: 'native_language', type: 'text', label: L('Native language', 'Langue maternelle') },
      { id: 'nationality', type: 'text', label: L('Nationality(ies)', 'Nationalité(s)') },
      { id: 'date_of_birth', type: 'date', label: L('Date of birth', 'Date de naissance'), required: true },
      { id: 'sex', type: 'text', label: L('Sex', 'Sexe') },
      { id: 'pronouns', type: 'text', label: L('Pronouns', 'Pronoms') },
      { id: 'grade', type: 'text', label: L('Grade in 26-27', 'Niveau 26-27') },
      { id: 'french_class', type: 'text', label: L('French class in 26-27', 'Classe de français 26-27') },
      { id: 'email', type: 'email', label: L('E-mail', 'E-mail'), required: true },
      { id: 'cell_phone', type: 'tel', label: L('Cell phone', 'Téléphone portable') },
    ],
  },
  {
    id: 'parents',
    title: L('Parents', 'Parents'),
    fields: [
      { id: 'father_last_name', type: 'text', group: 'father', label: L('Father — Last name', 'Père — Nom') },
      { id: 'father_first_name', type: 'text', group: 'father', label: L('Father — First name', 'Père — Prénom') },
      { id: 'father_nationality', type: 'text', group: 'father', label: L('Father — Nationality(ies)', 'Père — Nationalité(s)') },
      { id: 'father_native_language', type: 'text', group: 'father', label: L('Father — Native language', 'Père — Langue maternelle') },
      { id: 'father_cell_phone', type: 'tel', group: 'father', label: L('Father — Cell phone', 'Père — Téléphone portable') },
      { id: 'father_email', type: 'email', group: 'father', label: L('Father — Email', 'Père — Email') },
      { id: 'father_address', type: 'textarea', group: 'father', label: L('Father — Address', 'Père — Adresse') },
      { id: 'father_occupation', type: 'text', group: 'father', label: L('Father — Occupation', 'Père — Profession') },
      { id: 'mother_last_name', type: 'text', group: 'mother', label: L('Mother — Last name', 'Mère — Nom') },
      { id: 'mother_first_name', type: 'text', group: 'mother', label: L('Mother — First name', 'Mère — Prénom') },
      { id: 'mother_nationality', type: 'text', group: 'mother', label: L('Mother — Nationality(ies)', 'Mère — Nationalité(s)') },
      { id: 'mother_native_language', type: 'text', group: 'mother', label: L('Mother — Native language', 'Mère — Langue maternelle') },
      { id: 'mother_cell_phone', type: 'tel', group: 'mother', label: L('Mother — Cell phone', 'Mère — Téléphone portable') },
      { id: 'mother_email', type: 'email', group: 'mother', label: L('Mother — Email', 'Mère — Email') },
      { id: 'mother_address', type: 'textarea', group: 'mother', label: L('Mother — Address', 'Mère — Adresse') },
      { id: 'mother_occupation', type: 'text', group: 'mother', label: L('Mother — Occupation', 'Mère — Profession') },
      {
        id: 'family_status', type: 'radio',
        label: L('Family status', 'Situation familiale'),
        options: [
          { value: 'married', label: L('Married', 'Marié') },
          { value: 'separated', label: L('Separated', 'Séparé') },
          { value: 'step_family', label: L('Step-family', 'Famille recomposée') },
        ],
      },
      { id: 'separation_housing_address', type: 'textarea', label: L('If separated, address where the exchange student will be housed', 'En cas de séparation, adresse où sera accueilli le correspondant') },
    ],
  },
  {
    id: 'hosting',
    title: L('Hosting conditions', "Conditions d'accueil"),
    fields: [
      { id: 'brothers_at_home', type: 'text', label: L('# brothers at home (list ages)', '# frères à la maison (précisez âge)') },
      { id: 'sisters_at_home', type: 'text', label: L('# sisters at home (list ages)', '# sœurs à la maison (précisez âge)') },
      { id: 'pets', type: 'text', label: L('Animals in the home', 'Animaux domestiques') },
      { id: 'food_requirements', type: 'textarea', label: L('Food allergies or requirements', 'Spécificités alimentaires') },
      { id: 'other_allergies', type: 'textarea', label: L('Other allergies', 'Autres allergies') },
      { id: 'main_language_home', type: 'text', label: L('Main language spoken at home', 'Langue principale parlée en famille') },
      { id: 'other_languages_home', type: 'text', label: L('Other languages spoken at home', 'Autres langues parlées en famille') },
      { id: 'smoking_home', type: 'yesno', label: L('Does anyone smoke in the home?', 'Fume-t-on à la maison ?') },
      { id: 'own_room', type: 'yesno', label: L('Will the exchange student have their own room?', 'Chambre individuelle pour le correspondant ?') },
      { id: 'accept_opposite_sex', type: 'yesno', label: L('Would you accept an exchange student of the opposite sex?', 'Accepteriez-vous un échange mixte ?') },
    ],
  },
  {
    id: 'profile',
    title: L('Student profile', "Profil de l'élève"),
    fields: [
      { id: 'lived_abroad', type: 'textarea', label: L('If you have ever lived abroad, describe where and when', "Si vous avez déjà vécu à l'étranger, décrivez où et quand") },
      { id: 'countries_with_parents', type: 'textarea', label: L('Which countries have you visited with your parents?', 'Quels pays avez-vous visités avec vos parents ?') },
      { id: 'countries_without_parents', type: 'textarea', label: L('Which countries have you visited without your parents, and for how long?', 'Quels pays avez-vous visités sans vos parents, et combien de temps ?') },
      { id: 'sports', type: 'textarea', label: L('Sports you do and hours per week', 'Sports pratiqués et heures par semaine') },
      { id: 'activities', type: 'textarea', label: L('After-school activities, clubs, or hobbies and hours per week', 'Activités, clubs ou loisirs et heures par semaine') },
      { id: 'instruments', type: 'textarea', label: L('Do you play any instrument or sing?', "Jouez-vous d'un instrument ou chantez-vous ?") },
      { id: 'family_activities', type: 'textarea', label: L('Weekend/holiday family activities', 'Activités familiales le week-end / pendant les vacances') },
      { id: 'spare_time', type: 'textarea', label: L('What do you like to do most in your spare time?', 'Que préférez-vous faire pendant votre temps libre ?') },
      { id: 'adjectives', type: 'textarea', label: L('Three adjectives a close friend would use to describe you', 'Trois adjectifs qu’un ami proche utiliserait pour vous décrire') },
      { id: 'recharge', type: 'textarea', label: L('How do you recharge — around people or solo? Explain', 'Comment vous ressourcez-vous — entouré ou seul ? Expliquez') },
      { id: 'todo_list', type: 'textarea', label: L('Three items on your life "to-do" list', 'Trois choses sur votre liste de choses à faire dans la vie') },
      { id: 'ideal_partner', type: 'textarea', label: L('What would your ideal exchange partner be like?', 'Comment serait votre correspondant idéal ?') },
      { id: 'share_when_hosting', type: 'textarea', label: L('What would you like to share with your partner when hosting?', 'Que souhaiteriez-vous partager avec votre correspondant en l’accueillant ?') },
      { id: 'anything_else', type: 'textarea', label: L('Anything else you would like to add?', 'Souhaitez-vous ajouter autre chose ?') },
    ],
  },
]

export function allApplicationFields(): AppField[] {
  return APPLICATION_SECTIONS.flatMap(s => s.fields)
}

export function requiredApplicationFieldIds(): string[] {
  return allApplicationFields().filter(f => f.required).map(f => f.id)
}

export function missingRequiredApplication(data: Record<string, string>): string[] {
  return requiredApplicationFieldIds().filter(id => (data[id] ?? '').trim() === '')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- application-form`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/application-form.ts lib/__tests__/application-form.test.ts
git commit -m "feat: fixed bilingual application field catalog + validation"
```

---

## Task 4: Application emails

**Files:**
- Modify: `lib/email.ts`
- Test: `lib/__tests__/email.application.test.ts`

**Interfaces:**
- Consumes: existing `getResend()`, `esc()`.
- Produces (all return `Promise<void>`, fire-and-forget):
  - `sendApplicationResumeEmail(opts: { to: string; exchangeName: string; resumeUrl: string })`
  - `sendApplicationConfirmationEmail(opts: { to: string; applicantName: string; exchangeName: string })`
  - `sendNewApplicationAlertEmail(opts: { to: string; applicantName: string; exchangeName: string; reviewUrl: string })`
  - `sendInvitationEmail(opts: { to: string; applicantName: string; exchangeName: string; respondUrl: string })`
  - `sendApplicationRejectionEmail(opts: { to: string; applicantName: string; exchangeName: string; note: string })`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/email.application.test.ts`. With no `RESEND_API_KEY` the functions no-op (return without throwing); the test asserts they are exported and safe to call, and that the escaping helper is wired (we test escaping indirectly by ensuring a malicious name does not throw and the function resolves).

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => { delete process.env.RESEND_API_KEY })

import {
  sendApplicationResumeEmail, sendApplicationConfirmationEmail,
  sendNewApplicationAlertEmail, sendInvitationEmail, sendApplicationRejectionEmail,
} from '../email'

describe('application emails (no API key → no-op, never throw)', () => {
  it('all resolve without a configured key', async () => {
    await expect(sendApplicationResumeEmail({ to: 'a@b.co', exchangeName: 'X', resumeUrl: 'u' })).resolves.toBeUndefined()
    await expect(sendApplicationConfirmationEmail({ to: 'a@b.co', applicantName: '<b>', exchangeName: 'X' })).resolves.toBeUndefined()
    await expect(sendNewApplicationAlertEmail({ to: 'a@b.co', applicantName: '<b>', exchangeName: 'X', reviewUrl: 'u' })).resolves.toBeUndefined()
    await expect(sendInvitationEmail({ to: 'a@b.co', applicantName: '<b>', exchangeName: 'X', respondUrl: 'u' })).resolves.toBeUndefined()
    await expect(sendApplicationRejectionEmail({ to: 'a@b.co', applicantName: '<b>', exchangeName: 'X', note: 'n' })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- email.application`
Expected: FAIL — the new functions are not exported.

- [ ] **Step 3: Generalize `layout()` and add the emails**

In `lib/email.ts`, change the `layout` signature to accept an optional footer:

```typescript
function layout(body: string, footer = "You're receiving this because you have forms to complete for a student exchange."): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
      <h2 style="font-weight: 600;">EazyExchange</h2>
      ${body}
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #94a3b8;">${footer}</p>
    </div>
  `
}
```

Add a small shared sender so each function stays DRY:

```typescript
async function send(to: string, subject: string, html: string, label: string): Promise<void> {
  const resend = getResend()
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping ${label}`)
    return
  }
  const { error } = await resend.emails.send({ from: FROM, to, subject, html })
  // Never log PII; only the failure category.
  if (error) console.error(`[email] ${label} failed:`, error)
}
```

Append the five functions (all escape user content):

```typescript
const APP_FOOTER = "You're receiving this because you applied (or were invited to apply) to a student exchange."

export async function sendApplicationResumeEmail(opts: { to: string; exchangeName: string; resumeUrl: string }): Promise<void> {
  const html = layout(`
    <p>Hi,</p>
    <p>Here's your private link to continue your application for <strong>${esc(opts.exchangeName)}</strong>. You can leave and come back anytime, on any device:</p>
    <p><a href="${opts.resumeUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Continue my application</a></p>
    <p style="font-size:12px;color:#94a3b8;">Keep this email — it's the only way back to your in-progress application.</p>
  `, APP_FOOTER)
  await send(opts.to, `Continue your application — ${opts.exchangeName}`, html, 'application resume email')
}

export async function sendApplicationConfirmationEmail(opts: { to: string; applicantName: string; exchangeName: string }): Promise<void> {
  const greeting = opts.applicantName ? `Hi ${esc(opts.applicantName)},` : 'Hi,'
  const html = layout(`
    <p>${greeting}</p>
    <p>We've received your application for <strong>${esc(opts.exchangeName)}</strong>. The organizer will review it and be in touch.</p>
  `, APP_FOOTER)
  await send(opts.to, `Application received — ${opts.exchangeName}`, html, 'application confirmation email')
}

export async function sendNewApplicationAlertEmail(opts: { to: string; applicantName: string; exchangeName: string; reviewUrl: string }): Promise<void> {
  const html = layout(`
    <p>A new application has arrived for <strong>${esc(opts.exchangeName)}</strong> from <strong>${esc(opts.applicantName)}</strong>.</p>
    <p><a href="${opts.reviewUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Review applications</a></p>
  `)
  await send(opts.to, `New application — ${opts.exchangeName}`, html, 'new application alert email')
}

export async function sendInvitationEmail(opts: { to: string; applicantName: string; exchangeName: string; respondUrl: string }): Promise<void> {
  const greeting = opts.applicantName ? `Hi ${esc(opts.applicantName)},` : 'Hi,'
  const html = layout(`
    <p>${greeting}</p>
    <p>Great news — you've been accepted into <strong>${esc(opts.exchangeName)}</strong>! Please let the organizer know whether you'd like to join:</p>
    <p><a href="${opts.respondUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Respond to your invitation</a></p>
  `, APP_FOOTER)
  await send(opts.to, `You're invited — ${opts.exchangeName}`, html, 'invitation email')
}

export async function sendApplicationRejectionEmail(opts: { to: string; applicantName: string; exchangeName: string; note: string }): Promise<void> {
  const greeting = opts.applicantName ? `Hi ${esc(opts.applicantName)},` : 'Hi,'
  const note = opts.note ? `<p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">${esc(opts.note).replace(/\n/g, '<br>')}</p>` : ''
  const html = layout(`
    <p>${greeting}</p>
    <p>Thank you for applying to <strong>${esc(opts.exchangeName)}</strong>. After careful consideration, we're unable to offer you a place this time.</p>
    ${note}
    <p>We wish you all the best.</p>
  `, APP_FOOTER)
  await send(opts.to, `Update on your application — ${opts.exchangeName}`, html, 'application rejection email')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- email.application`
Expected: PASS (1 test, 5 assertions).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → PASS

```bash
git add lib/email.ts lib/__tests__/email.application.test.ts
git commit -m "feat(email): application funnel transactional emails"
```

---

## Task 5: Public application server actions (start, autosave, resume, submit, photo)

**Files:**
- Create: `actions/applications.ts`
- Test: `actions/__tests__/applications.test.ts`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `createAdminClient` (`@/lib/supabase/admin`), `randomToken` (`@/lib/tokens`), `missingRequiredApplication`, `allApplicationFields` (`@/lib/application-form`), `normalizeEmail`, `isValidEmail` (`@/lib/validation`), `MAX_ANSWER_LENGTH` (`@/lib/validation`), email senders (`@/lib/email`).
- Produces:
  - `startApplication(slug: string, input: { email: string; first_name: string; last_name: string; language: 'en' | 'fr' }): Promise<{ token: string }>`
  - `getApplicationDraft(token: string): Promise<{ status: string; data: Record<string,string>; language: 'en'|'fr'; photo_path: string | null; exchangeName: string } | null>`
  - `saveApplicationDraft(token: string, data: Record<string,string>): Promise<void>`
  - `submitApplication(token: string, data: Record<string,string>): Promise<void>`
  - `uploadApplicationPhoto(token: string, formData: FormData): Promise<{ path: string }>`

Notes for the implementer:
- These are unauthenticated. Use the **admin client** for all DB/storage writes (mirrors `inviteStudent`). Authorization is the secret token, never `auth.getUser()`.
- Never `console.log` the applicant email/name/answers.
- A draft can only be written while `status = 'draft'` (submit locks it).

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/applications.test.ts`. Mock the admin client with a chainable builder and a mutable `scenario`. (Follows the `forms.test.ts` style.)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  exchange: any | null
  application: any | null
  inserted: any
  updated: any
}

function builder(table: string) {
  const b: any = {
    _filters: {} as Record<string, any>,
    select: () => b,
    eq: (col: string, val: any) => { b._filters[col] = val; return b },
    order: () => b,
    insert: (row: any) => { scenario.inserted = { table, row }; return {
      select: () => ({ single: async () => ({ data: { ...row, id: 'app-1' }, error: null }) }),
    } },
    update: (row: any) => { scenario.updated = { table, row }; return { eq: async () => ({ error: null }) } },
    single: async () => ({ data: rowFor(table), error: rowFor(table) ? null : { message: 'none' } }),
    maybeSingle: async () => ({ data: rowFor(table), error: null }),
  }
  return b
}
function rowFor(table: string) {
  if (table === 'exchanges') return scenario.exchange
  if (table === 'applications') return scenario.application
  if (table === 'users') return [{ email: 'org@school.test' }]
  return null
}

const adminClient = {
  from: (t: string) => builder(t),
  storage: { from: () => ({ upload: async () => ({ data: { path: 'app-1/photo.png' }, error: null }) }) },
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => adminClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendApplicationResumeEmail: vi.fn(), sendApplicationConfirmationEmail: vi.fn(),
  sendNewApplicationAlertEmail: vi.fn(), sendInvitationEmail: vi.fn(), sendApplicationRejectionEmail: vi.fn(),
}))

import { startApplication, submitApplication, saveApplicationDraft } from '../applications'

beforeEach(() => {
  scenario = {
    exchange: { id: 'ex-1', name: 'France-Canada', school_a_id: 's-1', application_open: true, application_deadline: null },
    application: { id: 'app-1', exchange_id: 'ex-1', school_id: 's-1', status: 'draft', email: 'a@b.co', data: {} },
    inserted: null, updated: null,
  }
})

describe('startApplication', () => {
  it('rejects an invalid email', async () => {
    await expect(startApplication('slug', { email: 'nope', first_name: 'A', last_name: 'B', language: 'en' }))
      .rejects.toThrow('valid email')
  })
  it('rejects when the exchange is closed', async () => {
    scenario.exchange.application_open = false
    await expect(startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' }))
      .rejects.toThrow('closed')
  })
  it('creates a draft and returns its resume token', async () => {
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res.token).toBeTruthy()
    expect(scenario.inserted.table).toBe('applications')
    expect(scenario.inserted.row.status).toBe('draft')
  })
})

describe('saveApplicationDraft', () => {
  it('refuses to write a non-draft application', async () => {
    scenario.application.status = 'submitted'
    await expect(saveApplicationDraft('tok', { first_name: 'A' })).rejects.toThrow('locked')
  })
})

describe('submitApplication', () => {
  it('rejects when required fields are missing', async () => {
    await expect(submitApplication('tok', { first_name: 'A' })).rejects.toThrow('required')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- applications`
Expected: FAIL — cannot find module `../applications`.

- [ ] **Step 3: Implement the public actions**

Create `actions/applications.ts` (public actions in this step; organizer actions added in Task 6):

```typescript
'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomToken } from '@/lib/tokens'
import { normalizeEmail, isValidEmail, MAX_ANSWER_LENGTH } from '@/lib/validation'
import { missingRequiredApplication } from '@/lib/application-form'
import { validateUploadFile } from '@/lib/uploads'
import {
  sendApplicationResumeEmail, sendApplicationConfirmationEmail, sendNewApplicationAlertEmail,
} from '@/lib/email'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const PHOTO_BUCKET = 'application-photos'

function applicationsClosed(exchange: { application_open: boolean; application_deadline: string | null }): boolean {
  if (!exchange.application_open) return true
  if (exchange.application_deadline) {
    const today = new Date().toISOString().slice(0, 10)
    if (today > exchange.application_deadline) return true
  }
  return false
}

function tooLong(data: Record<string, string>): boolean {
  return Object.values(data).some(v => (v?.length ?? 0) > MAX_ANSWER_LENGTH)
}

export async function startApplication(
  slug: string,
  input: { email: string; first_name: string; last_name: string; language: 'en' | 'fr' },
): Promise<{ token: string }> {
  const email = normalizeEmail(input.email)
  if (!isValidEmail(email)) throw new Error('Please enter a valid email address')

  const admin = createAdminClient()
  const { data: exchange } = await admin
    .from('exchanges')
    .select('id, name, school_a_id, application_open, application_deadline')
    .eq('apply_slug', slug)
    .maybeSingle()
  if (!exchange) throw new Error('Application not found')
  if (applicationsClosed(exchange)) throw new Error('Applications are closed for this exchange')

  const token = randomToken()
  const { error } = await admin.from('applications').insert({
    exchange_id: exchange.id,
    school_id: exchange.school_a_id,
    email,
    resume_token: token,
    status: 'draft',
    language: input.language,
    data: { first_name: input.first_name.trim(), last_name: input.last_name.trim(), email },
  }).select('id').single()
  if (error) throw error

  await sendApplicationResumeEmail({
    to: email,
    exchangeName: exchange.name,
    resumeUrl: `${APP_URL}/apply/resume/${token}`,
  })
  return { token }
}

export async function getApplicationDraft(token: string) {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('status, data, language, photo_path, exchange_id')
    .eq('resume_token', token)
    .maybeSingle()
  if (!app) return null
  const { data: exchange } = await admin
    .from('exchanges').select('name').eq('id', app.exchange_id).maybeSingle()
  return {
    status: app.status, data: app.data ?? {}, language: app.language,
    photo_path: app.photo_path, exchangeName: exchange?.name ?? '',
  }
}

export async function saveApplicationDraft(token: string, data: Record<string, string>): Promise<void> {
  if (tooLong(data)) throw new Error(`An answer exceeds the ${MAX_ANSWER_LENGTH}-character limit.`)
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications').select('id, status').eq('resume_token', token).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (app.status !== 'draft') throw new Error('This application is already submitted and locked')
  const { error } = await admin
    .from('applications').update({ data }).eq('resume_token', token)
  if (error) throw error
}

export async function submitApplication(token: string, data: Record<string, string>): Promise<void> {
  if (tooLong(data)) throw new Error(`An answer exceeds the ${MAX_ANSWER_LENGTH}-character limit.`)
  const missing = missingRequiredApplication(data)
  if (missing.length > 0) throw new Error('Please complete all required fields before submitting.')

  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('id, status, email, exchange_id, school_id')
    .eq('resume_token', token).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (app.status !== 'draft') throw new Error('This application is already submitted')

  const { error } = await admin.from('applications').update({
    data, status: 'submitted', submitted_at: new Date().toISOString(),
  }).eq('resume_token', token)
  if (error) throw error

  // Emails: applicant confirmation + organizer alert. Fire-and-forget.
  const { data: exchange } = await admin
    .from('exchanges').select('name').eq('id', app.exchange_id).maybeSingle()
  const applicantName = `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim()
  await sendApplicationConfirmationEmail({
    to: app.email, applicantName, exchangeName: exchange?.name ?? '',
  })
  const { data: organizers } = await admin
    .from('users').select('email').eq('school_id', app.school_id).eq('role', 'organizer')
  for (const org of organizers ?? []) {
    await sendNewApplicationAlertEmail({
      to: org.email, applicantName, exchangeName: exchange?.name ?? '',
      reviewUrl: `${APP_URL}/exchanges/${app.exchange_id}/applications`,
    })
  }
}

export async function uploadApplicationPhoto(token: string, formData: FormData): Promise<{ path: string }> {
  const file = formData.get('photo')
  if (!(file instanceof File)) throw new Error('No file provided')
  const err = validateUploadFile({ type: file.type, size: file.size })
  if (err) throw new Error(err)
  if (!file.type.startsWith('image/')) throw new Error('Please upload an image file')

  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications').select('id, status').eq('resume_token', token).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (app.status !== 'draft') throw new Error('This application is already submitted and locked')

  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${app.id}/photo.${ext}`
  const { error: upErr } = await admin.storage.from(PHOTO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (upErr) throw upErr
  const { error } = await admin.from('applications').update({ photo_path: path }).eq('id', app.id)
  if (error) throw error
  return { path }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- applications`
Expected: PASS (start: 3, saveDraft: 1, submit: 1).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → PASS

```bash
git add actions/applications.ts actions/__tests__/applications.test.ts
git commit -m "feat(applications): public start/draft/submit/photo server actions"
```

---

## Task 6: Organizer review actions + accept/reject + invitation response (the bridge)

**Files:**
- Modify: `actions/applications.ts`
- Modify: `actions/__tests__/applications.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `createClient` (RLS-enforced, organizer paths), `createAdminClient` (account creation), `sendInvitationEmail`, `sendApplicationRejectionEmail`, `randomToken`.
- Produces:
  - `listApplications(exchangeId: string): Promise<Application[]>` — submitted/reviewed/responded, organizer-scoped.
  - `getApplicationForReview(applicationId: string): Promise<{ application: Application; photoUrl: string | null }>`
  - `acceptApplication(applicationId: string): Promise<void>`
  - `rejectApplication(applicationId: string, note: string, sendEmail: boolean): Promise<void>`
  - `getInvitation(token: string): Promise<{ exchangeName: string; applicantName: string; status: string } | null>` (public)
  - `respondToInvitation(token: string, response: 'yes' | 'no' | 'maybe', note: string): Promise<void>` (public)

Authorization model:
- `listApplications`, `getApplicationForReview`, `acceptApplication`, `rejectApplication` use the **authenticated** server client. Reuse the existing `assertExchangeInScope` pattern from `actions/exchanges.ts` (re-implement a small local `assertOrganizerOwnsApplication` that checks `my_role()='organizer'` + `school_id` match). RLS is the backstop; the explicit check gives clean error messages.
- `getInvitation`/`respondToInvitation` are **public**, keyed by `invite_token`, via the admin client.

- [ ] **Step 1: Write the failing tests (add to the existing test file)**

Append to `actions/__tests__/applications.test.ts`:

```typescript
import { respondToInvitation } from '../applications'

describe('respondToInvitation', () => {
  beforeEach(() => {
    scenario.application = {
      id: 'app-1', exchange_id: 'ex-1', school_id: 's-1', status: 'accepted',
      email: 'a@b.co', invite_token: 'inv-1', data: { first_name: 'A', last_name: 'B' },
      enrolled_user_id: null,
    }
  })
  it('records a No without creating an account', async () => {
    await respondToInvitation('inv-1', 'no', '')
    expect(scenario.updated.table).toBe('applications')
    expect(scenario.updated.row.status).toBe('declined')
  })
  it('records a Maybe with a note', async () => {
    await respondToInvitation('inv-1', 'maybe', 'need to check dates')
    expect(scenario.updated.row.status).toBe('maybe')
    expect(scenario.updated.row.invite_response_note).toBe('need to check dates')
  })
  it('rejects a response for a non-invited application', async () => {
    scenario.application.status = 'submitted'
    await expect(respondToInvitation('inv-1', 'yes', '')).rejects.toThrow()
  })
})
```

NOTE: the "Yes" branch creates an auth user via `admin.auth.admin.inviteUserByEmail`. Extend the `adminClient` mock in the file with:

```typescript
// add to adminClient object:
auth: { admin: {
  inviteUserByEmail: async () => ({ data: { user: { id: 'new-user' } }, error: null }),
  deleteUser: async () => ({ error: null }),
} },
```

and add a "Yes enrolls" test:

```typescript
it('on Yes creates the account, enrolls, and marks enrolled', async () => {
  await respondToInvitation('inv-1', 'yes', '')
  expect(scenario.updated.row.status).toBe('enrolled')
  expect(scenario.updated.row.enrolled_user_id).toBe('new-user')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- applications`
Expected: FAIL — `respondToInvitation`/`acceptApplication` not exported.

- [ ] **Step 3: Implement the organizer + bridge actions**

Append to `actions/applications.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendInvitationEmail, sendApplicationRejectionEmail } from '@/lib/email'

async function assertOrganizerOwnsApplication(supabase: any, userId: string, applicationId: string) {
  const { data: profile } = await supabase
    .from('users').select('school_id, role').eq('id', userId).single()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  const { data: app } = await supabase
    .from('applications').select('*').eq('id', applicationId).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (app.school_id !== profile.school_id) throw new Error('Unauthorized')
  return app
}

export async function listApplications(exchangeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('exchange_id', exchangeId)
    .neq('status', 'draft')
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getApplicationForReview(applicationId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const application = await assertOrganizerOwnsApplication(supabase, user.id, applicationId)

  let photoUrl: string | null = null
  if (application.photo_path) {
    // Organizer authorization already verified above; use admin to sign the URL
    // (the application-photos bucket has no per-user storage policy).
    const admin = createAdminClient()
    const { data } = await admin.storage.from(PHOTO_BUCKET)
      .createSignedUrl(application.photo_path, 3600)
    photoUrl = data?.signedUrl ?? null
  }
  return { application, photoUrl }
}

export async function acceptApplication(applicationId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const app = await assertOrganizerOwnsApplication(supabase, user.id, applicationId)
  if (app.status !== 'submitted' && app.status !== 'rejected') {
    throw new Error('Only a submitted application can be accepted')
  }
  const inviteToken = randomToken()
  const { error } = await supabase.from('applications').update({
    status: 'accepted', invite_token: inviteToken,
    reviewed_at: new Date().toISOString(), reviewer_id: user.id, review_note: null,
  }).eq('id', applicationId)
  if (error) throw error

  const { data: exchange } = await supabase
    .from('exchanges').select('name').eq('id', app.exchange_id).maybeSingle()
  const applicantName = `${app.data?.first_name ?? ''} ${app.data?.last_name ?? ''}`.trim()
  await sendInvitationEmail({
    to: app.email, applicantName, exchangeName: exchange?.name ?? '',
    respondUrl: `${APP_URL}/invite/${inviteToken}`,
  })
  revalidatePath(`/exchanges/${app.exchange_id}/applications`)
}

export async function rejectApplication(applicationId: string, note: string, sendEmail: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const app = await assertOrganizerOwnsApplication(supabase, user.id, applicationId)
  const { error } = await supabase.from('applications').update({
    status: 'rejected', reviewed_at: new Date().toISOString(),
    reviewer_id: user.id, review_note: note || null,
  }).eq('id', applicationId)
  if (error) throw error

  if (sendEmail) {
    const { data: exchange } = await supabase
      .from('exchanges').select('name').eq('id', app.exchange_id).maybeSingle()
    const applicantName = `${app.data?.first_name ?? ''} ${app.data?.last_name ?? ''}`.trim()
    await sendApplicationRejectionEmail({
      to: app.email, applicantName, exchangeName: exchange?.name ?? '', note,
    })
  }
  revalidatePath(`/exchanges/${app.exchange_id}/applications`)
}

// ---- Public invitation response (keyed by invite_token) ----

export async function getInvitation(token: string) {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications').select('status, data, exchange_id').eq('invite_token', token).maybeSingle()
  if (!app) return null
  const { data: exchange } = await admin
    .from('exchanges').select('name').eq('id', app.exchange_id).maybeSingle()
  const applicantName = `${app.data?.first_name ?? ''} ${app.data?.last_name ?? ''}`.trim()
  return { exchangeName: exchange?.name ?? '', applicantName, status: app.status }
}

export async function respondToInvitation(
  token: string, response: 'yes' | 'no' | 'maybe', note: string,
): Promise<void> {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications').select('*').eq('invite_token', token).maybeSingle()
  if (!app) throw new Error('Invitation not found')
  if (!['accepted', 'maybe'].includes(app.status)) {
    throw new Error('This invitation is no longer open')
  }
  const base = {
    invite_response: response, invite_response_note: note || null,
    responded_at: new Date().toISOString(),
  }

  if (response === 'no') {
    await admin.from('applications').update({ ...base, status: 'declined' }).eq('id', app.id)
    return
  }
  if (response === 'maybe') {
    await admin.from('applications').update({ ...base, status: 'maybe' }).eq('id', app.id)
    return
  }

  // Yes → create the auth account + profile + enrollment (reuses inviteStudent's
  // proven sequence). The trg_assign_on_enrollment_insert trigger fans out the
  // Phase 2 form assignments automatically.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(app.email, {
    redirectTo: `${APP_URL}/accept-invite`,
  })
  if (inviteError) {
    if ((inviteError as any).code === 'email_exists') throw new Error('An account already exists for this email')
    throw inviteError
  }
  const fullName = `${app.data?.first_name ?? ''} ${app.data?.last_name ?? ''}`.trim()
  const { error: profileError } = await admin.from('users').insert({
    id: invited.user.id, school_id: app.school_id, role: 'student' as const,
    email: app.email, full_name: fullName,
  })
  if (profileError) {
    await admin.auth.admin.deleteUser(invited.user.id).catch(() => {})
    throw profileError
  }
  const { error: enrollError } = await admin.from('exchange_enrollments').insert({
    exchange_id: app.exchange_id, user_id: invited.user.id,
  })
  if (enrollError && (enrollError as any).code !== '23505') throw enrollError

  await admin.from('applications').update({
    ...base, status: 'enrolled', enrolled_user_id: invited.user.id,
  }).eq('id', app.id)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- applications`
Expected: PASS (all prior + respond: no/maybe/non-invited/yes).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → PASS

```bash
git add actions/applications.ts actions/__tests__/applications.test.ts
git commit -m "feat(applications): organizer review + accept/reject + invite-response bridge"
```

---

## Task 7: Application-photos storage bucket

**Files:**
- Create: `supabase/migrations/20260629000002_application_photos_bucket.sql`

**Interfaces:**
- Produces (DB): private bucket `application-photos` with an image MIME allowlist + 10 MB cap. No public/anon storage policies — all reads/writes go through the admin client in server actions.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260629000002_application_photos_bucket.sql`:

```sql
-- Private bucket for the applicant photo. The public application path uploads via
-- the service-role admin client (no auth user), and organizers read via a
-- service-role-signed URL after an explicit school-ownership check in
-- actions/applications.ts. No anon/authenticated storage policies are granted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-photos', 'application-photos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    public = excluded.public;
```

- [ ] **Step 2: Sanity-check existing bucket migration shape**

Run: `cat supabase/migrations/20260625000001_storage_policies.sql`
Expected: confirm how the `documents` bucket was created (insert into `storage.buckets`). Match that exact column set; adjust the insert above if the codebase uses a different creation form (e.g. `storage.create_bucket`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260629000002_application_photos_bucket.sql
git commit -m "feat(db): private application-photos storage bucket"
```

---

## Task 8: Make `/apply` and `/invite` public in middleware

**Files:**
- Modify: `middleware.ts`
- Test: `app/__tests__/middleware.test.ts` (extend if it asserts route gating)

**Interfaces:**
- Produces: unauthenticated GET to `/apply/*` and `/invite/*` is not redirected to `/login`.

- [ ] **Step 1: Inspect the existing middleware test**

Run: `cat app/__tests__/middleware.test.ts`
Expected: learn the test harness shape (how it builds a request and asserts redirect vs pass-through).

- [ ] **Step 2: Add a failing test**

In `app/__tests__/middleware.test.ts`, add a case (adapt to the file's existing helpers) asserting that an unauthenticated request to `/apply/some-slug` and `/invite/tok` is NOT redirected to `/login`. If the existing test mocks `updateSession`, follow that mock shape.

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test -- middleware`
Expected: FAIL — currently `/apply` is redirected because it's neither an auth nor public route.

- [ ] **Step 4: Update middleware**

In `middleware.ts`, change the public-route check:

```typescript
  const isPublicRoute =
    pathname === '/' ||
    pathname.startsWith('/apply') ||
    pathname.startsWith('/invite')
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test -- middleware`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add middleware.ts app/__tests__/middleware.test.ts
git commit -m "feat: make /apply and /invite public routes"
```

---

## Task 9: Exchange — slug on create + open/deadline control action

**Files:**
- Modify: `actions/exchanges.ts`
- Test: `actions/__tests__/exchanges.test.ts` (create if absent)

**Interfaces:**
- Consumes: `applySlug` (`@/lib/tokens`), existing `assertExchangeInScope`.
- Produces:
  - `createExchange` now sets `apply_slug: applySlug(name)` on insert.
  - `setApplicationOpen(exchangeId: string, open: boolean, deadline: string | null): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/exchanges.test.ts` (mock-client style; assert `setApplicationOpen` rejects a non-organizer and updates when in scope). Minimal:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: { role: string; school: string; exchangeSchools: [string, string]; updated: any }

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from(table: string) {
      const b: any = {
        select: () => b, eq: () => b,
        update: (row: any) => { scenario.updated = row; return { eq: async () => ({ error: null }) } },
        single: async () => table === 'users'
          ? { data: { school_id: scenario.school, role: scenario.role } }
          : { data: null },
        maybeSingle: async () => table === 'exchanges'
          ? { data: { school_a_id: scenario.exchangeSchools[0], school_b_id: scenario.exchangeSchools[1] } }
          : { data: null },
      }
      return b
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setApplicationOpen } from '../exchanges'

beforeEach(() => { scenario = { role: 'organizer', school: 's-1', exchangeSchools: ['s-1', 's-2'], updated: null } })

describe('setApplicationOpen', () => {
  it('rejects a student', async () => {
    scenario.role = 'student'
    await expect(setApplicationOpen('ex-1', true, null)).rejects.toThrow('Unauthorized')
  })
  it('updates the flag for an in-scope organizer', async () => {
    await setApplicationOpen('ex-1', true, '2026-09-01')
    expect(scenario.updated).toEqual({ application_open: true, application_deadline: '2026-09-01' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- exchanges`
Expected: FAIL — `setApplicationOpen` not exported.

- [ ] **Step 3: Implement**

In `actions/exchanges.ts`: add the import `import { applySlug } from '@/lib/tokens'`.

In `createExchange`, change the insert to include the slug:

```typescript
  const { error } = await supabase.from('exchanges').insert({
    name, year,
    school_a_id: profile.school_id, school_b_id: schoolBId,
    apply_slug: applySlug(name),
  })
```

Append:

```typescript
export async function setApplicationOpen(exchangeId: string, open: boolean, deadline: string | null): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: profile } = await supabase
    .from('users').select('school_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  await assertExchangeInScope(supabase, user.id, exchangeId)

  const { error } = await supabase
    .from('exchanges')
    .update({ application_open: open, application_deadline: deadline })
    .eq('id', exchangeId)
  if (error) throw error
  revalidatePath(`/exchanges/${exchangeId}`)
}
```

NOTE: `assertExchangeInScope` is defined in this file but not exported — it's in module scope, so calling it from the new function works. The role check above is added because `assertExchangeInScope` only checks school participation, not role.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- exchanges`
Expected: PASS (2 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → PASS

```bash
git add actions/exchanges.ts actions/__tests__/exchanges.test.ts
git commit -m "feat(exchanges): apply_slug on create + setApplicationOpen control"
```

---

## Task 10: Public start page + start form component

**Files:**
- Create: `app/apply/[slug]/page.tsx`
- Create: `components/ApplicationStartForm.tsx`

**Interfaces:**
- Consumes: `createAdminClient` (server, to resolve slug → exchange name + open state), `startApplication` (Task 5).
- Produces: a public page at `/apply/<slug>` that shows the intro + start form when open, or a closed notice.

- [ ] **Step 1: Build the start form component**

Create `components/ApplicationStartForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { startApplication } from '@/actions/applications'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ApplicationStartForm({ slug }: { slug: string }) {
  const [lang, setLang] = useState<'en' | 'fr'>('en')
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function start() {
    setLoading(true); setError(null)
    try {
      const { token } = await startApplication(slug, { ...form, language: lang })
      router.push(`/apply/resume/${token}`)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong'); setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-1 text-sm">
        <button onClick={() => setLang('en')} className={lang === 'en' ? 'font-semibold underline' : 'text-slate-500'}>EN</button>
        <span className="text-slate-300">/</span>
        <button onClick={() => setLang('fr')} className={lang === 'fr' ? 'font-semibold underline' : 'text-slate-500'}>FR</button>
      </div>
      <div className="space-y-1">
        <Label htmlFor="first_name">{lang === 'fr' ? 'Prénom' : 'First name'}</Label>
        <Input id="first_name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="last_name">{lang === 'fr' ? 'Nom' : 'Last name'}</Label>
        <Input id="last_name" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <p className="text-xs text-slate-400">{lang === 'fr' ? 'Nous vous enverrons un lien privé pour reprendre votre candidature à tout moment.' : "We'll email you a private link to resume your application anytime."}</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={start} disabled={loading || !form.email || !form.first_name || !form.last_name}>
        {loading ? '…' : (lang === 'fr' ? 'Commencer ma candidature' : 'Start my application')}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Build the page**

Create `app/apply/[slug]/page.tsx`:

```tsx
import { createAdminClient } from '@/lib/supabase/admin'
import { ApplicationStartForm } from '@/components/ApplicationStartForm'

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()
  const { data: exchange } = await admin
    .from('exchanges')
    .select('name, application_open, application_deadline')
    .eq('apply_slug', slug)
    .maybeSingle()

  const closed = !exchange || !exchange.application_open ||
    (exchange.application_deadline != null && new Date().toISOString().slice(0, 10) > exchange.application_deadline)

  return (
    <main className="max-w-lg mx-auto px-4 py-12">
      {!exchange ? (
        <p className="text-slate-600">This application link is not valid.</p>
      ) : closed ? (
        <div>
          <h1 className="text-2xl font-semibold mb-2">{exchange.name}</h1>
          <p className="text-slate-600">Applications are currently closed for this exchange.</p>
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-semibold mb-1">{exchange.name}</h1>
          <p className="text-slate-600 mb-6">Apply to join this student exchange. Start by entering your details below.</p>
          <ApplicationStartForm slug={slug} />
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Start dev server (`pnpm dev`). Open `/apply/<a-real-slug>` (get one from the DB or Task 12's card). Verify: closed state shows when `application_open=false`; when open, submitting the start form redirects to `/apply/resume/<token>`. (Email send is skipped locally without `RESEND_API_KEY` — expected.)

- [ ] **Step 5: Commit**

```bash
git add app/apply/[slug]/page.tsx components/ApplicationStartForm.tsx
git commit -m "feat(apply): public application start page + form"
```

---

## Task 11: Public resume/fill page + full application form component

**Files:**
- Create: `app/apply/resume/[token]/page.tsx`
- Create: `components/ApplicationForm.tsx`

**Interfaces:**
- Consumes: `getApplicationDraft`, `saveApplicationDraft`, `submitApplication`, `uploadApplicationPhoto` (Task 5); `APPLICATION_SECTIONS`, `missingRequiredApplication` (Task 3).
- Produces: a public fill page that renders the catalog, autosaves, uploads the photo, and submits.

- [ ] **Step 1: Build the form component**

Create `components/ApplicationForm.tsx`:

```tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { APPLICATION_SECTIONS, missingRequiredApplication, type AppField } from '@/lib/application-form'
import { saveApplicationDraft, submitApplication, uploadApplicationPhoto } from '@/actions/applications'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ALLOWED_UPLOAD_ACCEPT } from '@/lib/uploads'

interface Props {
  token: string
  initialData: Record<string, string>
  initialLanguage: 'en' | 'fr'
  locked: boolean
}

export function ApplicationForm({ token, initialData, initialLanguage, locked }: Props) {
  const [lang, setLang] = useState<'en' | 'fr'>(initialLanguage)
  const [data, setData] = useState<Record<string, string>>(initialData)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  function set(id: string, value: string) {
    setData(prev => {
      const next = { ...prev, [id]: value }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void autosave(next), 800)
      return next
    })
  }
  async function autosave(d: Record<string, string>) {
    if (locked) return
    setSaving(true)
    try { await saveApplicationDraft(token, d) } catch { /* transient; next edit retries */ } finally { setSaving(false) }
  }
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData(); fd.set('photo', file)
    try { await uploadApplicationPhoto(token, fd) } catch (err: any) { setError(err.message) }
  }

  async function onSubmit() {
    const missing = missingRequiredApplication(data)
    if (missing.length) { setError(lang === 'fr' ? 'Veuillez remplir tous les champs obligatoires.' : 'Please complete all required fields.'); return }
    setSubmitting(true); setError(null)
    try { await submitApplication(token, data); setDone(true) }
    catch (err: any) { setError(err.message); setSubmitting(false) }
  }

  if (done) {
    return <p className="text-slate-700">{lang === 'fr' ? 'Merci ! Votre candidature a été envoyée.' : 'Thank you! Your application has been submitted.'}</p>
  }

  function renderField(f: AppField) {
    const label = f.label[lang]
    if (f.type === 'textarea') {
      return <Textarea id={f.id} value={data[f.id] ?? ''} onChange={e => set(f.id, e.target.value)} disabled={locked} />
    }
    if (f.type === 'yesno') {
      return (
        <div className="flex gap-4 text-sm">
          {['yes', 'no'].map(v => (
            <label key={v} className="flex items-center gap-1">
              <input type="radio" name={f.id} checked={data[f.id] === v} onChange={() => set(f.id, v)} disabled={locked} />
              {lang === 'fr' ? (v === 'yes' ? 'Oui' : 'Non') : (v === 'yes' ? 'Yes' : 'No')}
            </label>
          ))}
        </div>
      )
    }
    if (f.type === 'radio') {
      return (
        <div className="flex flex-col gap-1 text-sm">
          {f.options!.map(o => (
            <label key={o.value} className="flex items-center gap-1">
              <input type="radio" name={f.id} checked={data[f.id] === o.value} onChange={() => set(f.id, o.value)} disabled={locked} />
              {o.label[lang]}
            </label>
          ))}
        </div>
      )
    }
    const inputType = f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'
    return <Input id={f.id} type={inputType} value={data[f.id] ?? ''} onChange={e => set(f.id, e.target.value)} disabled={locked} />
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 text-sm">
          <button onClick={() => setLang('en')} className={lang === 'en' ? 'font-semibold underline' : 'text-slate-500'}>EN</button>
          <span className="text-slate-300">/</span>
          <button onClick={() => setLang('fr')} className={lang === 'fr' ? 'font-semibold underline' : 'text-slate-500'}>FR</button>
        </div>
        {saving && <span className="text-xs text-slate-400">{lang === 'fr' ? 'Enregistrement…' : 'Saving…'}</span>}
      </div>

      {APPLICATION_SECTIONS.map(section => (
        <section key={section.id} className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-1">{section.title[lang]}</h2>
          {section.id === 'student' && (
            <div className="space-y-1">
              <Label>{lang === 'fr' ? 'Photo récente' : 'Recent photo'}</Label>
              <input type="file" accept={ALLOWED_UPLOAD_ACCEPT} onChange={onPhoto} disabled={locked} />
            </div>
          )}
          {section.fields.map(f => (
            <div key={f.id} className="space-y-1">
              <Label htmlFor={f.id}>{f.label[lang]}{f.required && <span className="text-red-500 ml-1">*</span>}</Label>
              {renderField(f)}
            </div>
          ))}
        </section>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!locked && (
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? '…' : (lang === 'fr' ? 'Envoyer ma candidature' : 'Submit my application')}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build the resume page**

Create `app/apply/resume/[token]/page.tsx`:

```tsx
import { getApplicationDraft } from '@/actions/applications'
import { ApplicationForm } from '@/components/ApplicationForm'

export default async function ResumePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const draft = await getApplicationDraft(token)

  if (!draft) {
    return <main className="max-w-2xl mx-auto px-4 py-12"><p className="text-slate-600">This application link is not valid.</p></main>
  }
  const locked = draft.status !== 'draft'
  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold mb-1">{draft.exchangeName}</h1>
      {locked && <p className="text-sm text-emerald-700 mb-6">Your application has been submitted. It's now read-only.</p>}
      <ApplicationForm token={token} initialData={draft.data} initialLanguage={draft.language} locked={locked} />
    </main>
  )
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Manual verification**

With `pnpm dev`: start an application (Task 10) → land on resume page → type in fields, confirm "Saving…" appears → reload the page, confirm values persisted → upload an image → submit with a required field blank (blocked) → fill required, submit (success message) → reload, confirm the form is read-only.

- [ ] **Step 5: Commit**

```bash
git add app/apply/resume/[token]/page.tsx components/ApplicationForm.tsx
git commit -m "feat(apply): resume/fill page with autosave, photo upload, submit"
```

---

## Task 12: Organizer — applications card on the exchange page

**Files:**
- Create: `components/ApplicationsCard.tsx`
- Modify: `app/(organizer)/exchanges/[id]/page.tsx`

**Interfaces:**
- Consumes: `getExchange` (existing), `listApplications` (Task 6), `setApplicationOpen` (Task 9).
- Produces: a Phase 1 card showing the share link, open/closed toggle + deadline, counts, hint, and a link to the applications list.

- [ ] **Step 1: Read the current exchange page**

Run: `cat "app/(organizer)/exchanges/[id]/page.tsx"`
Expected: understand the current layout so the card is inserted above the existing grid without disrupting it.

- [ ] **Step 2: Build the card**

Create `components/ApplicationsCard.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { setApplicationOpen } from '@/actions/exchanges'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

interface Props {
  exchangeId: string
  applySlug: string
  open: boolean
  deadline: string | null
  counts: { submitted: number; toReview: number; accepted: number }
}

export function ApplicationsCard({ exchangeId, applySlug, open, deadline, counts }: Props) {
  const [isOpen, setIsOpen] = useState(open)
  const [dl, setDl] = useState(deadline ?? '')
  const [saving, setSaving] = useState(false)
  const appUrl = typeof window !== 'undefined' ? `${window.location.origin}/apply/${applySlug}` : `/apply/${applySlug}`

  async function toggle(next: boolean) {
    setSaving(true)
    try { await setApplicationOpen(exchangeId, next, dl || null); setIsOpen(next) } finally { setSaving(false) }
  }
  async function saveDeadline() {
    setSaving(true)
    try { await setApplicationOpen(exchangeId, isOpen, dl || null) } finally { setSaving(false) }
  }

  return (
    <Card className="p-5 mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700">Phase 1 · Applications</h2>
        <Button size="sm" variant={isOpen ? 'secondary' : 'outline'} disabled={saving} onClick={() => toggle(!isOpen)}>
          {isOpen ? 'Open — click to close' : 'Closed — click to open'}
        </Button>
      </div>

      <label className="text-xs text-slate-500">Share this link in your intro email:</label>
      <div className="flex gap-2 mt-1 mb-3">
        <Input readOnly value={appUrl} onFocus={e => e.currentTarget.select()} />
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(appUrl)}>Copy</Button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-slate-500">Deadline:</label>
        <Input type="date" value={dl} onChange={e => setDl(e.target.value)} className="w-auto" />
        <Button size="sm" variant="ghost" disabled={saving} onClick={saveDeadline}>Save</Button>
      </div>

      {counts.toReview > 0 && (
        <p className="text-sm text-amber-700 mb-2">{counts.toReview} new application{counts.toReview === 1 ? '' : 's'} waiting for review.</p>
      )}
      <p className="text-sm text-slate-600 mb-3">
        {counts.submitted} submitted · {counts.accepted} accepted
      </p>
      <Button asChild size="sm"><Link href={`/exchanges/${exchangeId}/applications`}>Review applications</Link></Button>
    </Card>
  )
}
```

- [ ] **Step 3: Wire it into the exchange page**

In `app/(organizer)/exchanges/[id]/page.tsx`, import the card + `listApplications`, fetch the applications alongside the existing data, compute counts, and render `<ApplicationsCard … />` above the existing grid. Add (adapting to the file's existing structure):

```tsx
import { ApplicationsCard } from '@/components/ApplicationsCard'
import { listApplications } from '@/actions/applications'
// …inside the component, alongside the existing getExchange/getExchangeGrid calls:
const applications = await listApplications(id)
const counts = {
  submitted: applications.filter(a => ['submitted','accepted','declined','maybe','enrolled','rejected'].includes(a.status)).length,
  toReview: applications.filter(a => a.status === 'submitted').length,
  accepted: applications.filter(a => ['accepted','maybe','enrolled'].includes(a.status)).length,
}
// …in JSX, above the grid:
<ApplicationsCard
  exchangeId={id}
  applySlug={exchange.apply_slug}
  open={exchange.application_open}
  deadline={exchange.application_deadline}
  counts={counts}
/>
```

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Manual verification**

As an organizer, open an exchange page. Verify the card shows the apply link, the open/close toggle persists across reload, the deadline saves, and "Review applications" links to the list route.

- [ ] **Step 6: Commit**

```bash
git add components/ApplicationsCard.tsx "app/(organizer)/exchanges/[id]/page.tsx"
git commit -m "feat(organizer): Phase 1 applications card on exchange page"
```

---

## Task 13: Organizer — applications list + detail/review pages

**Files:**
- Create: `app/(organizer)/exchanges/[id]/applications/page.tsx`
- Create: `app/(organizer)/exchanges/[id]/applications/[applicationId]/page.tsx`
- Create: `components/ApplicationReadView.tsx`
- Create: `components/ApplicationReviewActions.tsx`

**Interfaces:**
- Consumes: `listApplications`, `getApplicationForReview`, `acceptApplication`, `rejectApplication` (Task 6); `APPLICATION_SECTIONS` (Task 3); `getExchange`.
- Produces: list page (status badges) + detail page (read view + photo + accept/reject + response state).

- [ ] **Step 1: Build the read view**

Create `components/ApplicationReadView.tsx`:

```tsx
import { APPLICATION_SECTIONS } from '@/lib/application-form'

export function ApplicationReadView({ data, photoUrl }: { data: Record<string, string>; photoUrl: string | null }) {
  return (
    <div className="space-y-8">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="Applicant photo" className="h-40 w-40 rounded-lg object-cover border" />
      )}
      {APPLICATION_SECTIONS.map(section => (
        <section key={section.id}>
          <h2 className="text-sm font-semibold text-slate-700 border-b pb-1 mb-3">{section.title.en}</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {section.fields.map(f => (
              <div key={f.id}>
                <dt className="text-xs text-slate-500">{f.label.en}</dt>
                <dd className="text-sm text-slate-900 whitespace-pre-wrap">{data[f.id]?.trim() || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Build the review actions**

Create `components/ApplicationReviewActions.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { acceptApplication, rejectApplication } from '@/actions/applications'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props { applicationId: string; exchangeId: string; status: string; response: string | null; note: string | null }

export function ApplicationReviewActions({ applicationId, exchangeId, status, response, note }: Props) {
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn(); router.push(`/exchanges/${exchangeId}/applications`) }
    catch (e: any) { setError(e.message); setBusy(false) }
  }

  if (status === 'accepted' || status === 'declined' || status === 'maybe' || status === 'enrolled') {
    const labels: Record<string, string> = {
      accepted: 'Accepted — awaiting response', enrolled: 'Enrolled (said Yes)',
      declined: 'Declined the invitation', maybe: 'Responded Maybe',
    }
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{labels[status]}</p>
        {response && <p className="text-sm text-slate-600">Response: <strong>{response}</strong></p>}
        {note && <p className="text-sm text-slate-600">Note: {note}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {status === 'rejected' && <p className="text-sm text-red-600">Currently rejected. You can still accept.</p>}
      {!rejecting ? (
        <div className="flex gap-3">
          <Button disabled={busy} onClick={() => run(() => acceptApplication(applicationId))}>Accept</Button>
          <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>Reject</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea placeholder="Optional note to the applicant" value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
            Send a rejection email to the applicant
          </label>
          <div className="flex gap-3">
            <Button variant="destructive" disabled={busy} onClick={() => run(() => rejectApplication(applicationId, rejectNote, sendEmail))}>Confirm reject</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
```

NOTE: if `variant="destructive"` does not exist on the shadcn Button in this repo, check `components/ui/button.tsx` and use `variant="outline"` with a red text class instead.

- [ ] **Step 3: Build the list page**

Create `app/(organizer)/exchanges/[id]/applications/page.tsx`:

```tsx
import Link from 'next/link'
import { getExchange } from '@/actions/exchanges'
import { listApplications } from '@/actions/applications'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function ApplicationsListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [exchange, applications] = await Promise.all([getExchange(id), listApplications(id)])

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-slate-500">
        <Link href={`/exchanges/${id}`}>← Back to {exchange.name}</Link>
      </Button>
      <h1 className="text-2xl font-semibold mb-6">Applications</h1>
      {applications.length === 0 ? (
        <p className="text-sm text-slate-500">No applications submitted yet.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {applications.map(a => {
            const name = `${a.data?.first_name ?? ''} ${a.data?.last_name ?? ''}`.trim() || a.email
            return (
              <Link key={a.id} href={`/exchanges/${id}/applications/${a.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-900">{name}</p>
                  <p className="text-xs text-slate-500">{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : ''}</p>
                </div>
                <Badge variant="outline">{a.status}</Badge>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Build the detail page**

Create `app/(organizer)/exchanges/[id]/applications/[applicationId]/page.tsx`:

```tsx
import Link from 'next/link'
import { getApplicationForReview } from '@/actions/applications'
import { ApplicationReadView } from '@/components/ApplicationReadView'
import { ApplicationReviewActions } from '@/components/ApplicationReviewActions'
import { Button } from '@/components/ui/button'

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string; applicationId: string }> }) {
  const { id, applicationId } = await params
  const { application, photoUrl } = await getApplicationForReview(applicationId)
  const name = `${application.data?.first_name ?? ''} ${application.data?.last_name ?? ''}`.trim() || application.email

  return (
    <div className="max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-slate-500">
        <Link href={`/exchanges/${id}/applications`}>← Back to applications</Link>
      </Button>
      <h1 className="text-2xl font-semibold mb-1">{name}</h1>
      <p className="text-sm text-slate-500 mb-6">{application.email}</p>

      <div className="mb-8 p-4 border rounded-lg bg-slate-50">
        <ApplicationReviewActions
          applicationId={application.id}
          exchangeId={id}
          status={application.status}
          response={application.invite_response}
          note={application.invite_response_note ?? application.review_note}
        />
      </div>

      <ApplicationReadView data={application.data} photoUrl={photoUrl} />
    </div>
  )
}
```

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Manual verification**

As an organizer: open the applications list, click a submitted application, read the answers + photo. Click Accept → status becomes "accepted" and (with a key configured) an invitation email is queued. Reject another with a note → status "rejected". Confirm an out-of-school organizer cannot open the detail (it throws Unauthorized).

- [ ] **Step 7: Commit**

```bash
git add "app/(organizer)/exchanges/[id]/applications" components/ApplicationReadView.tsx components/ApplicationReviewActions.tsx
git commit -m "feat(organizer): applications list + detail review pages"
```

---

## Task 14: Public invitation response page

**Files:**
- Create: `app/invite/[token]/page.tsx`
- Create: `components/InviteResponseForm.tsx`

**Interfaces:**
- Consumes: `getInvitation`, `respondToInvitation` (Task 6).
- Produces: a public page where an accepted candidate answers Yes/No/Maybe; Yes triggers account creation server-side and points them to check their email.

- [ ] **Step 1: Build the responder component**

Create `components/InviteResponseForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { respondToInvitation } from '@/actions/applications'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function InviteResponseForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [result, setResult] = useState<'yes' | 'no' | 'maybe' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function respond(response: 'yes' | 'no' | 'maybe') {
    setBusy(true); setError(null)
    try { await respondToInvitation(token, response, response === 'maybe' ? note : ''); setResult(response) }
    catch (e: any) { setError(e.message); setBusy(false) }
  }

  if (result === 'yes') return <p className="text-emerald-700">Wonderful! Check your email for a link to set up your account and get started.</p>
  if (result === 'no') return <p className="text-slate-700">Thanks for letting us know. We wish you all the best.</p>
  if (result === 'maybe') return <p className="text-slate-700">Thanks — we've noted your response and the organizer will follow up.</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <Button disabled={busy} onClick={() => respond('yes')}>Yes, I'd like to join</Button>
        <Button variant="outline" disabled={busy} onClick={() => respond('no')}>No, thank you</Button>
      </div>
      <div className="space-y-2">
        <Textarea placeholder="If you're unsure, add a note (optional)" value={note} onChange={e => setNote(e.target.value)} />
        <Button variant="ghost" disabled={busy} onClick={() => respond('maybe')}>Maybe — I need more time</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Build the page**

Create `app/invite/[token]/page.tsx`:

```tsx
import { getInvitation } from '@/actions/applications'
import { InviteResponseForm } from '@/components/InviteResponseForm'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await getInvitation(token)

  if (!invite) {
    return <main className="max-w-lg mx-auto px-4 py-12"><p className="text-slate-600">This invitation link is not valid.</p></main>
  }
  const closed = !['accepted', 'maybe'].includes(invite.status)
  return (
    <main className="max-w-lg mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold mb-2">You're invited to {invite.exchangeName}!</h1>
      {closed ? (
        <p className="text-slate-600">This invitation has already been answered.</p>
      ) : (
        <>
          <p className="text-slate-600 mb-6">{invite.applicantName ? `Hi ${invite.applicantName}, ` : ''}you've been accepted. Will you join the exchange?</p>
          <InviteResponseForm token={token} />
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Manual verification (full funnel)**

After accepting an application (Task 13), get its `invite_token` (from the DB or the invitation email) and open `/invite/<token>`. Test all three: "No" → declined message, status `declined`; "Maybe" + note → noted, status `maybe`; "Yes" → "check your email" message, and confirm a new student `users` row + `exchange_enrollments` row exist and Phase 2 forms were auto-assigned (the existing trigger). Re-opening an answered invite shows the "already answered" state.

- [ ] **Step 5: Commit**

```bash
git add app/invite/[token]/page.tsx components/InviteResponseForm.tsx
git commit -m "feat(invite): public Yes/No/Maybe response page + enrollment on Yes"
```

---

## Task 15: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the unit suite**

Run: `pnpm test`
Expected: PASS — all suites including tokens, application-form, email.application, applications, exchanges, middleware.

- [ ] **Step 2: Lint + type-check**

Run: `pnpm lint && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Apply migrations to the linked project**

Run: `supabase db push`
Expected: both `20260629…` migrations apply cleanly. (Requires network + linked project; this is the one step that can't be validated purely locally.)

- [ ] **Step 4: End-to-end smoke (against dev + linked DB)**

Walk the spec's verification list: open applications → start + resume on a second browser → submit → organizer reviews → reject one (email) → accept another → respond Maybe then Yes → enrolled student sees auto-assigned Phase 2 forms → `enrolled_user_id` links the application. Close applications and confirm the apply link shows the closed page.

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore: application funnel verification fixes"
```

---

## Self-review notes (author)

- **Spec coverage:** account-free apply (T5), fixed bilingual form + language toggle (T3, T10, T11), magic-link resume (T5 token + T11 page), photo upload (T5 + T7 bucket), state machine (T1 check constraint + T5/T6 transitions), organizer dashboard card + list + detail with light hints (T12, T13), accept→invite→Yes/No/Maybe→enrolled bridge reusing existing invite/enrollment (T6), all five emails (T4), open/close + deadline + slug (T1, T9), public routing (T8). Phase 2 untouched and fed by the existing enrollment trigger. ✓
- **Deferred (per spec):** organizer-customizable questions, Phase 3, capacity, languages beyond FR/EN — not implemented. ✓
- **Type consistency:** `applications.data` is `Record<string,string>` everywhere; `resume_token`/`invite_token` are distinct per stage; status values match the DB check constraint and the `ApplicationStatus` union.
- **Open implementer checks flagged inline:** `set_updated_at()` existence (T1), storage bucket creation form (T7), `Button` `destructive` variant (T13), middleware test harness shape (T8).
