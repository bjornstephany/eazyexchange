# Redesign Phase 4 — Élèves + Réglages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the redesigned `/students` (Élèves master-detail directory) and `/settings` (Réglages: Compte / Équipe & rôles / Facturation / Programme) organizer pages, organizer team invites via `/join/[token]`, per-student relance, password change with HIBP check, French € plan display, and exchange archiving with a server-side write guard.

**Architecture:** Élèves reuses the existing dossier machinery — `rollupStudent` from `lib/dashboard/rollup.ts` for status, `applications.data` (via `enrolled_user_id`) for identity/parents, `assignments.last_reminded_at` for relance cooldown. Réglages loads everything server-side in `page.tsx` and renders client section cards that call server actions. Team = `users.org_role` (`owner`/`admin`) + an `organizer_invites` table written only via service-role actions. Archiving = `exchanges.archived_at` + `assertExchangeWritable` called by every exchange-scoped mutating action.

**Tech Stack:** Next.js 14 App Router + Server Actions, Supabase (Postgres/RLS/Auth admin), Stripe (payment-method display), Resend, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-04-redesign-phase4-eleves-reglages-design.md` — copy and layout come from `design_handoff_eazyexchange/Eazyexchange Eleves.dc.html` and `Eazyexchange Reglages.dc.html`.

**Plan-level deviations from the spec (deliberate, record in the ledger):**
1. The spec says "factor Phase 3's reminder core into `remindAssignments`". Instead, `remindStudent` sends **one grouped e-mail per student** listing all outstanding pièces (consistent with the daily cron's grouping) — a per-assignment loop would fire N separate e-mails at one family. `notifyIncompleteAssignees` in `actions/forms.ts` stays untouched for the per-template flow.
2. Public join actions live in `actions/join.ts` (not `actions/settings.ts`) so the unauthenticated surface is one small file.
3. Organizer invite tokens expire after **14 days** (the spec said "same TTL as student invites", i.e. 7 days) — colleagues respond slower than applicants mid-flow, and the e-mail copy states the validity explicitly.

## Global Constraints

- All new product copy is **French** (vouvoiement for organizers, tutoiement in student-facing e-mails), verbatim from the handoff demo scripts where given. No English UI strings in new components.
- Styling uses the Phase-1 Tailwind tokens only — `navy, rail, brand, brand-hover, tint, tint-text, success, success-text, warn, warn-text, danger, danger-text, subtle, hoverrow, placeholder, tertiary, frame-dashed, hint`, `font-display`, `font-mono`, `rounded-pill`, `shadow-float`, `shadow-modal`, `bg-card`, `bg-background`. **Exception:** the 10-colour avatar palette and the profile-avatar gradient are data constants (inline `style`), copied verbatim from the handoff — this mirrors how the demo treats them.
- Package manager is **pnpm**. Verification gates: `pnpm lint`, `pnpm test`, `npx tsc --noEmit` (NOT `pnpm build` — local `.env.local` has placeholders, build fails by design).
- **Never log student/parent PII** (e-mails, names, submission contents). All user-supplied values in e-mail HTML go through the existing `esc()` helper in `lib/email.ts`.
- RLS: no self-referential policies; new access via migration only; never service-role from the browser. Owner-only actions re-check `org_role='owner'` server-side.
- Plan display prices are **199 € / 499 € / 799 € par an** (user decision 2026-07-04). Keys stay `starter/growth/scale`.
- Work on branch `redesign/phase-4-eleves-reglages`. Commit after each green task. Merging to `main` deploys to production — requires user confirmation, full gates, a live drive, applying the migration to prod, and redeploying the `send-reminders` edge function.
- `supabase db push` hangs on IPv6-less networks — use the IPv4 session pooler `--db-url` if needed (see memory/CLAUDE.md).
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Stage only named files (never `git add -A` — untracked student PDFs are PII).

## File Map

| File | Responsibility |
|---|---|
| `supabase/migrations/20260704000001_phase4_eleves_reglages.sql` | `users.{phone,title,org_role}` + owner backfill + trigger pin, `organizer_invites` table + RLS, `exchanges.archived_at` |
| `types/db.ts` | `OrgRole`, `OrganizerInvite`, new columns on `UserProfile`/`Exchange` |
| `lib/auth/provision.ts` | Self-registered organizers get `org_role: 'owner'` |
| `lib/students/directory.ts` | Pure Élèves derivations: `StudentVM`, checklist pills, summary, chips, sort, accent-insensitive filter |
| `lib/auth/hibp.ts` | HIBP k-anonymity check + password policy + shared French messages |
| `lib/billing/display.ts` | FR plan labels/prices/descriptions + usage line (single source, retrofitted everywhere) |
| `lib/exchange-guard.ts` | `assertExchangeWritable` (archived ⇒ throw) |
| `lib/exchange-session.ts` | Fallback prefers non-archived exchanges |
| `lib/email.ts` | `sendStudentReminderEmail` (grouped, FR-student), `sendOrganizerInviteEmail` (FR-organizer) |
| `actions/students.ts` | `getStudentsDirectory`, `remindStudent` |
| `actions/settings.ts` | `updateProfile`, `changePassword`, `getTeam`, `inviteOrganizer`, `revokeOrganizerInvite`, `getBillingOverview`, `getProgramInfo`, `archiveExchange`, `restoreExchange` |
| `actions/join.ts` | Public: `getJoinInvite`, `acceptOrganizerInvite` |
| `app/(organizer)/students/page.tsx` | Élèves route (cookie-scoped) |
| `app/(organizer)/settings/page.tsx` | Réglages route (server assembly) |
| `app/join/[token]/page.tsx` + `components/auth/JoinForm.tsx` | Organizer invite acceptance |
| `components/students/StudentsView.tsx`, `StudentDetail.tsx` | Élèves master-detail UI |
| `components/settings/SettingsView.tsx`, `ProfileCard.tsx`, `SecurityCard.tsx`, `TeamCard.tsx`, `BillingCard.tsx`, `ProgramCard.tsx` | Réglages UI |
| `components/shell/OrganizerShell.tsx`, `RailIcons.tsx`, `SessionSelector.tsx`, `app/(organizer)/layout.tsx` | Élèves/Réglages rail items, students top bar, settings top bar (school name), « Archivé » pills |
| `actions/forms.ts`, `actions/exchanges.ts`, `actions/applications.ts`, `actions/submissions.ts` | `assertExchangeWritable` wiring |
| `supabase/functions/send-reminders/index.ts` | Skip archived exchanges |
| `middleware.ts` | `/join` is public |

Key types defined in Task 2 (`lib/students/directory.ts`) and consumed by Tasks 3–4:

```ts
export type StatusKey = 'complet' | 'verif' | 'incomplet' | 'retard'
export type DirectoryTemplate = {
  id: string; name: string; deadline: string | null
  type: 'data_entry' | 'document_upload'; kind: 'online' | 'pdf' | 'doc'
}
export type ChecklistItem = {
  assignmentId: string; label: string; group: 'Formulaire' | 'Document'
  pill: Pill; reviewable: boolean
}
export type ParentContact = { role: 'PÈRE' | 'MÈRE'; name: string; tel: string; email: string }
export type StudentVM = {
  id: string; name: string; firstName: string; initials: string; avatarBg: string
  statusKey: StatusKey; overall: Pill; summary: string; sub: string
  identity: { l: string; v: string }[]; parents: ParentContact[]
  applicationId: string | null
  checklist: ChecklistItem[]; provided: number; total: number; pct: number
  dueLabel: string | null
}
```

Key types defined in Task 7/8 (consumed by Tasks 11–12):

```ts
// actions/settings.ts
export type TeamMember = { id: string; name: string; email: string; isOwner: boolean; isYou: boolean }
export type PendingInvite = { id: string; email: string }
export type BillingOverview = {
  planLabel: string; price: string; per: string; desc: string
  usageLabel: string; usagePct: number
  payment: { note: string; cta: string; href: string }
}
export type ProgramInfo = {
  id: string; name: string; year: number; phase: 1 | 2; archived: boolean
  enrolled: number; applications: number; earliestDeadline: string | null
}
```

---

### Task 1: Branch, migration, types, owner provisioning

**Files:**
- Create: `supabase/migrations/20260704000001_phase4_eleves_reglages.sql`
- Modify: `types/db.ts`, `lib/auth/provision.ts`

**Interfaces:**
- Produces: DB columns `users.{phone,title,org_role}` (org_role `'owner'|'admin'`, default `'admin'`, pinned immutable), table `organizer_invites`, `exchanges.archived_at`; TS types `OrgRole`, `OrganizerInvite`, extended `UserProfile`/`Exchange`. Self-registered organizers are `owner`.
- The migration is **not** applied to the remote DB during development — it is applied at merge time (Task 13). Nothing before Task 13 needs a live DB.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b redesign/phase-4-eleves-reglages
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260704000001_phase4_eleves_reglages.sql`:

```sql
-- Phase 4 (Élèves + Réglages): organizer profile fields, team roles + invites,
-- exchange archiving.

-- 1 · users: profile fields + org_role ---------------------------------------
alter table users
  add column phone text,
  add column title text,
  add column org_role text not null default 'admin' check (org_role in ('owner', 'admin'));

-- Backfill BEFORE the trigger below pins org_role: the earliest organizer of
-- each school becomes its owner. (The pre-existing trigger version only pins
-- role/school_id, so this UPDATE passes.)
update users u set org_role = 'owner'
where u.role = 'organizer'
  and u.id = (
    select x.id from users x
    where x.school_id = u.school_id and x.role = 'organizer'
    order by x.created_at, x.id
    limit 1
  );

-- Pin org_role alongside role/school_id (mirrors 20260630000003): the
-- "users update themselves" RLS policy would otherwise let an admin PATCH
-- themselves to owner. Ownership transfer is not a feature; no app path
-- (service-role included) updates org_role after insert.
create or replace function guard_user_immutable_fields()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     or new.school_id is distinct from old.school_id
     or new.org_role is distinct from old.org_role then
    raise exception 'role, school_id and org_role cannot be changed'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_user_immutable_fields() from public, anon, authenticated;

-- 2 · organizer_invites --------------------------------------------------------
-- Every write goes through service-role server actions (the owner check lives
-- in the action), so there are no INSERT/UPDATE/DELETE policies on purpose.
create table organizer_invites (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  email text not null,
  token text not null unique,
  invited_by uuid references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index organizer_invites_school_idx on organizer_invites(school_id);
alter table organizer_invites enable row level security;
create policy "organizers read school invites" on organizer_invites for select
  using (my_role() = 'organizer' and school_id = my_school_id());

-- 3 · exchange archiving --------------------------------------------------------
alter table exchanges add column archived_at timestamptz;
```

- [ ] **Step 3: Extend `types/db.ts`**

Add after the `Role` line:

```ts
export type OrgRole = 'owner' | 'admin'
```

Extend `UserProfile`:

```ts
export type UserProfile = {
  id: string; school_id: string; role: Role
  full_name: string; email: string; created_at: string
  phone: string | null; title: string | null; org_role: OrgRole
}
```

Extend `Exchange` with `archived_at: string | null`. Add:

```ts
export type OrganizerInvite = {
  id: string; school_id: string; email: string; token: string
  invited_by: string | null; created_at: string; expires_at: string
  accepted_at: string | null; revoked_at: string | null
}
```

In the `Database` table map: change the `users` Insert shape so the new defaulted columns stay optional, and register the new table (mirror the existing `TableDef` pattern):

```ts
users: TableDef<
  UserProfile,
  Omit<UserProfile, 'created_at' | 'phone' | 'title' | 'org_role'> &
    Partial<Pick<UserProfile, 'phone' | 'title' | 'org_role'>>,
  Partial<UserProfile>
>
organizer_invites: TableDef<
  OrganizerInvite,
  Omit<OrganizerInvite, 'id' | 'created_at' | 'expires_at' | 'accepted_at' | 'revoked_at'> &
    Partial<Pick<OrganizerInvite, 'expires_at'>>,
  Partial<OrganizerInvite>
>
```

- [ ] **Step 4: Owner provisioning**

In `lib/auth/provision.ts`, `createOrganizerAccount`, add `org_role` to the profile insert (self-registration creates the school ⇒ this person is the owner):

```ts
const { error: profileError } = await admin.from('users').insert({
  id: user.id,
  school_id: school.id,
  role: 'organizer' as const,
  org_role: 'owner' as const,
  full_name: fullName,
  email,
})
```

- [ ] **Step 5: Gates**

Run: `npx tsc --noEmit && pnpm test`
Expected: clean compile, all existing tests pass (no behavior change yet).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260704000001_phase4_eleves_reglages.sql types/db.ts lib/auth/provision.ts
git commit -m "feat(phase4): migration — org_role + organizer_invites + exchanges.archived_at

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Students directory derivations (`lib/students/directory.ts`)

**Files:**
- Create: `lib/students/directory.ts`
- Test: `lib/students/__tests__/directory.test.ts`

**Interfaces:**
- Consumes: `rollupStudent`, `frShortDate`, `p`, `Pill`, `CellMap` from `@/lib/dashboard/rollup` (existing).
- Produces (used by Tasks 3–4): `StatusKey`, `DirectoryTemplate`, `ChecklistItem`, `ParentContact`, `StudentVM`, `AVATAR_BG`, `buildStudentVM(input)`, `sortStudents(vms)`, `chipDefs(vms)`, `filterStudents(vms, status, query)`, `listSummary(vms)`, `reminderNote(vm)`, `normalize(text)`.

- [ ] **Step 1: Write the failing tests**

Create `lib/students/__tests__/directory.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  buildStudentVM, sortStudents, chipDefs, filterStudents, listSummary,
  reminderNote, normalize, AVATAR_BG,
  type DirectoryTemplate, type StudentVM,
} from '@/lib/students/directory'
import type { CellMap } from '@/lib/dashboard/rollup'

const templates: DirectoryTemplate[] = [
  { id: 't1', name: 'Formulaire de santé', deadline: '2026-10-10', type: 'data_entry', kind: 'online' },
  { id: 't2', name: 'Décharge de responsabilité', deadline: '2026-10-10', type: 'document_upload', kind: 'pdf' },
  { id: 't3', name: 'Passeport', deadline: '2026-10-03', type: 'document_upload', kind: 'doc' },
]
const student = { id: 's1', full_name: 'Camille Laurent', email: 'camille@email.fr' }
const application = {
  id: 'app1',
  data: {
    last_name: 'Laurent', first_name: 'Camille', date_of_birth: '2009-03-14',
    grade: 'Première', french_class: '1re G2', native_language: 'Français',
    email: 'camille.laurent@email.fr', cell_phone: '06 12 24 37 52',
    father_first_name: 'Marc', father_last_name: 'Laurent',
    father_cell_phone: '06 22 34 51 61', father_email: 'marc.laurent@email.fr',
  },
}
const today = new Date('2026-09-20T10:00:00Z')

function vm(cellMap: CellMap, app: typeof application | null = application): StudentVM {
  return buildStudentVM({ student, application: app, templates, cellMap, avatarIndex: 0, today })
}

describe('buildStudentVM', () => {
  it('maps identity rows from application data with dd/mm/yyyy dob', () => {
    const v = vm({ 's1:t1': { assignmentId: 'a1', status: 'approved' } })
    expect(v.identity).toEqual([
      { l: 'Nom', v: 'Laurent' },
      { l: 'Prénom', v: 'Camille' },
      { l: 'Date de naissance', v: '14/03/2009' },
      { l: 'Niveau 26-27', v: 'Première' },
      { l: 'Classe', v: '1re G2' },
      { l: 'Langue maternelle', v: 'Français' },
      { l: 'E-mail', v: 'camille.laurent@email.fr' },
      { l: 'Téléphone', v: '06 12 24 37 52' },
    ])
    expect(v.sub).toBe('Première · 1re G2 · Français')
    expect(v.applicationId).toBe('app1')
    expect(v.avatarBg).toBe(AVATAR_BG[0])
    expect(v.initials).toBe('CL')
  })

  it('falls back to users.email and — when the application is missing', () => {
    const v = vm({}, null)
    expect(v.applicationId).toBeNull()
    expect(v.identity.find(r => r.l === 'E-mail')?.v).toBe('camille@email.fr')
    expect(v.identity.find(r => r.l === 'Nom')?.v).toBe('—')
    expect(v.parents).toEqual([])
    expect(v.sub).toBe('')
  })

  it('renders only parent cards that have at least one value', () => {
    const v = vm({})
    expect(v.parents).toEqual([
      { role: 'PÈRE', name: 'Marc Laurent', tel: '06 22 34 51 61', email: 'marc.laurent@email.fr' },
    ])
  })

  it('builds the checklist only from assigned templates, with the pill mapping', () => {
    const v = vm({
      's1:t1': { assignmentId: 'a1', status: 'approved' },
      's1:t2': { assignmentId: 'a2', status: 'submitted' },
      's1:t3': { assignmentId: 'a3' }, // assignment without submission
    })
    expect(v.checklist).toHaveLength(3)
    expect(v.checklist[0]).toMatchObject({ label: 'Formulaire de santé', group: 'Formulaire', reviewable: true })
    expect(v.checklist[0].pill).toEqual({ kind: 'ok', label: 'Fourni' })
    expect(v.checklist[1].group).toBe('Formulaire') // pdf kind is a formulaire
    expect(v.checklist[1].pill).toEqual({ kind: 'info', label: 'À vérifier' })
    expect(v.checklist[2]).toMatchObject({ group: 'Document', reviewable: false })
    expect(v.checklist[2].pill).toEqual({ kind: 'bad', label: 'Manquant' })
    expect(v.provided).toBe(1)
    expect(v.total).toBe(3)
    expect(v.pct).toBe(33)
    expect(v.dueLabel).toBe('Échéance 3 oct')
  })

  it('maps rejected and draft to « En cours »', () => {
    const v = vm({
      's1:t1': { assignmentId: 'a1', status: 'rejected' },
      's1:t2': { assignmentId: 'a2', status: 'draft' },
    })
    expect(v.checklist[0].pill).toEqual({ kind: 'warn', label: 'En cours' })
    expect(v.checklist[1].pill).toEqual({ kind: 'warn', label: 'En cours' })
  })

  it('derives statusKey from the rollup overall pill', () => {
    const complet = vm({
      's1:t1': { assignmentId: 'a1', status: 'approved' },
      's1:t2': { assignmentId: 'a2', status: 'approved' },
      's1:t3': { assignmentId: 'a3', status: 'approved' },
    })
    expect(complet.statusKey).toBe('complet')
    expect(complet.summary).toBe('Dossier complet')

    const verif = vm({ 's1:t3': { assignmentId: 'a3', status: 'submitted' } })
    expect(verif.statusKey).toBe('verif')
    expect(verif.summary).toBe('1 pièce à vérifier')

    const incomplet = vm({ 's1:t1': { assignmentId: 'a1' }, 's1:t2': { assignmentId: 'a2' } })
    expect(incomplet.statusKey).toBe('incomplet')
    expect(incomplet.summary).toBe('2 pièces attendues')

    const late = buildStudentVM({
      student, application, templates,
      cellMap: { 's1:t3': { assignmentId: 'a3' } },
      avatarIndex: 0, today: new Date('2026-10-05T10:00:00Z'),
    })
    expect(late.statusKey).toBe('retard')
    expect(late.summary).toBe('Échéance dépassée — 1 pièce attendue')
  })
})

describe('list helpers', () => {
  const mk = (id: string, name: string, statusKey: StudentVM['statusKey']): StudentVM => ({
    id, name, firstName: name.split(' ')[0], initials: 'XX', avatarBg: AVATAR_BG[0],
    statusKey, overall: { kind: 'ok', label: 'Complet' }, summary: '', sub: '',
    identity: [], parents: [], applicationId: null, checklist: [],
    provided: 0, total: 0, pct: 0, dueLabel: null,
  })

  it('sorts by status rank then name', () => {
    const sorted = sortStudents([
      mk('a', 'Zoé A', 'complet'), mk('b', 'Ana B', 'retard'),
      mk('c', 'Léa C', 'verif'), mk('d', 'Max D', 'incomplet'),
      mk('e', 'Bob E', 'retard'),
    ])
    expect(sorted.map(s => s.id)).toEqual(['b', 'e', 'd', 'c', 'a'])
  })

  it('counts chips including Tous', () => {
    const chips = chipDefs([mk('a', 'A', 'complet'), mk('b', 'B', 'retard'), mk('c', 'C', 'retard')])
    expect(chips).toEqual([
      { key: null, label: 'Tous', count: 3 },
      { key: 'complet', label: 'Complet', count: 1 },
      { key: 'verif', label: 'À vérifier', count: 0 },
      { key: 'incomplet', label: 'Incomplet', count: 0 },
      { key: 'retard', label: 'En retard', count: 2 },
    ])
  })

  it('filters by status and accent-insensitive query', () => {
    const vms = [mk('a', 'Chaïma Haddad', 'complet'), mk('b', 'Inès Garcia', 'retard')]
    expect(filterStudents(vms, 'retard', '')).toHaveLength(1)
    expect(filterStudents(vms, null, 'chaima')).toEqual([vms[0]])
    expect(filterStudents(vms, 'complet', 'ines')).toHaveLength(0)
  })

  it('builds the page subline', () => {
    expect(listSummary([mk('a', 'A', 'complet'), mk('b', 'B', 'complet'), mk('c', 'C', 'retard')]))
      .toBe('3 élèves confirmés · 2 dossiers complets')
    expect(listSummary([mk('a', 'A', 'retard')])).toBe('1 élève confirmé · 0 dossier complet')
  })

  it('reminder note: complete vs pending', () => {
    const done = mk('a', 'Camille Laurent', 'complet')
    expect(reminderNote(done)).toBe('Dossier complet — aucune relance prévue pour Camille.')
    const pending = { ...mk('b', 'Yanis Benali', 'incomplet'), dueLabel: 'Échéance 10 oct' }
    expect(reminderNote(pending)).toBe(
      'Relances automatiques par e-mail jusqu’à réception — Yanis et ses parents reçoivent la liste des pièces attendues (Échéance 10 oct).'
    )
    const noDue = mk('c', 'Léa C', 'incomplet')
    expect(reminderNote(noDue)).toBe(
      'Relances automatiques par e-mail jusqu’à réception — Léa et ses parents reçoivent la liste des pièces attendues.'
    )
  })

  it('normalize strips accents and lowers', () => {
    expect(normalize('Échéance Chaïma')).toBe('echeance chaima')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test lib/students`
Expected: FAIL — module `@/lib/students/directory` not found.

- [ ] **Step 3: Implement `lib/students/directory.ts`**

```ts
// Pure derivations for the Élèves directory (design: Eazyexchange Eleves.dc.html).
// Server actions assemble raw rows; everything display-shaped is computed here.
import { rollupStudent, frShortDate, p, type CellMap, type Pill, type TemplateInfo } from '@/lib/dashboard/rollup'

export type StatusKey = 'complet' | 'verif' | 'incomplet' | 'retard'

export type DirectoryTemplate = {
  id: string
  name: string
  deadline: string | null
  type: 'data_entry' | 'document_upload'
  kind: 'online' | 'pdf' | 'doc'
}

export type ChecklistItem = {
  assignmentId: string
  label: string
  group: 'Formulaire' | 'Document'
  pill: Pill
  reviewable: boolean
}

export type ParentContact = { role: 'PÈRE' | 'MÈRE'; name: string; tel: string; email: string }

export type StudentVM = {
  id: string
  name: string
  firstName: string
  initials: string
  avatarBg: string
  statusKey: StatusKey
  overall: Pill
  summary: string
  sub: string
  identity: { l: string; v: string }[]
  parents: ParentContact[]
  applicationId: string | null
  checklist: ChecklistItem[]
  provided: number
  total: number
  pct: number
  dueLabel: string | null
}

// Handoff avatar palette (data constant, not a Tailwind token — see plan constraints).
export const AVATAR_BG = [
  '#2456E6', '#7C5CE0', '#0F8A6D', '#C2543A', '#B0468C',
  '#3A7CC2', '#8A6A0B', '#4A5FC2', '#0F7A3D', '#C0392B',
]

const KIND_TO_KEY: Record<Pill['kind'], StatusKey> = {
  ok: 'complet', info: 'verif', warn: 'incomplet', bad: 'retard', neutral: 'incomplet',
}

const CHECK_PILLS: Record<string, Pill> = {
  approved: { kind: 'ok', label: 'Fourni' },
  submitted: { kind: 'info', label: 'À vérifier' },
  draft: { kind: 'warn', label: 'En cours' },
  rejected: { kind: 'warn', label: 'En cours' },
}
const MISSING_PILL: Pill = { kind: 'bad', label: 'Manquant' }

export function normalize(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
}

// 'YYYY-MM-DD' → 'DD/MM/YYYY'; anything else passes through untouched.
function frDob(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v
}

const dash = (v: string | undefined) => (v && v.trim() ? v.trim() : '—')

function parentCard(role: 'PÈRE' | 'MÈRE', prefix: 'father' | 'mother', data: Record<string, string>): ParentContact | null {
  const first = (data[`${prefix}_first_name`] ?? '').trim()
  const last = (data[`${prefix}_last_name`] ?? '').trim()
  const tel = (data[`${prefix}_cell_phone`] ?? '').trim()
  const email = (data[`${prefix}_email`] ?? '').trim()
  if (!first && !last && !tel && !email) return null
  return { role, name: [first, last].filter(Boolean).join(' ') || '—', tel: tel || '—', email: email || '—' }
}

export function buildStudentVM(input: {
  student: { id: string; full_name: string; email: string }
  application: { id: string; data: Record<string, string> } | null
  templates: DirectoryTemplate[]
  cellMap: CellMap
  avatarIndex: number
  today?: Date
}): StudentVM {
  const { student, application, templates, cellMap, avatarIndex } = input
  const today = input.today ?? new Date()
  const data = application?.data ?? {}

  // Rollup runs on the student's OWN assignments only (conditional pièces are
  // per-student), so restrict the template list to those present in cellMap.
  const assigned = templates.filter(t => cellMap[`${student.id}:${t.id}`])
  const rollup = rollupStudent(
    { id: student.id, full_name: student.full_name },
    assigned.map(t => ({ id: t.id, type: t.type, name: t.name, deadline: t.deadline ?? '' }) as TemplateInfo),
    cellMap,
    today,
  )
  const statusKey = KIND_TO_KEY[rollup.overall.kind]

  const checklist: ChecklistItem[] = assigned.map(t => {
    const cell = cellMap[`${student.id}:${t.id}`]!
    const pill = (cell.status && CHECK_PILLS[cell.status]) || MISSING_PILL
    return {
      assignmentId: cell.assignmentId,
      label: t.name,
      group: t.kind === 'doc' ? 'Document' : 'Formulaire',
      pill,
      reviewable: !!cell.status,
    }
  })
  const provided = checklist.filter(c => c.pill.label === 'Fourni').length
  const total = checklist.length
  const attendues = checklist.filter(c => c.pill.label === 'Manquant' || c.pill.label === 'En cours').length
  const verif = checklist.filter(c => c.pill.label === 'À vérifier').length

  const summary =
    statusKey === 'complet' ? 'Dossier complet'
    : statusKey === 'verif' ? `${verif} pièce${p(verif)} à vérifier`
    : statusKey === 'retard' ? `Échéance dépassée — ${attendues} pièce${p(attendues)} attendue${p(attendues)}`
    : `${attendues} pièce${p(attendues)} attendue${p(attendues)}`

  const identity = [
    { l: 'Nom', v: dash(data.last_name) },
    { l: 'Prénom', v: dash(data.first_name) },
    { l: 'Date de naissance', v: data.date_of_birth ? frDob(data.date_of_birth) : '—' },
    { l: 'Niveau 26-27', v: dash(data.grade) },
    { l: 'Classe', v: dash(data.french_class) },
    { l: 'Langue maternelle', v: dash(data.native_language) },
    { l: 'E-mail', v: dash(data.email) === '—' ? student.email : dash(data.email) },
    { l: 'Téléphone', v: dash(data.cell_phone) },
  ]

  const parents = [
    parentCard('PÈRE', 'father', data),
    parentCard('MÈRE', 'mother', data),
  ].filter((x): x is ParentContact => x !== null)

  const sub = [data.grade, data.french_class, data.native_language]
    .map(v => (v ?? '').trim()).filter(Boolean).join(' · ')

  return {
    id: student.id,
    name: student.full_name,
    firstName: student.full_name.split(/\s+/)[0] ?? student.full_name,
    initials: initialsOf(student.full_name),
    avatarBg: AVATAR_BG[avatarIndex % AVATAR_BG.length],
    statusKey,
    overall: rollup.overall,
    summary,
    sub,
    identity,
    parents,
    applicationId: application?.id ?? null,
    checklist,
    provided,
    total,
    pct: total > 0 ? Math.round((provided / total) * 100) : 0,
    dueLabel: rollup.due ? `Échéance ${frShortDate(rollup.due)}` : null,
  }
}

const RANK: Record<StatusKey, number> = { retard: 0, incomplet: 1, verif: 2, complet: 3 }

export function sortStudents(vms: StudentVM[]): StudentVM[] {
  return [...vms].sort((a, b) => RANK[a.statusKey] - RANK[b.statusKey] || a.name.localeCompare(b.name))
}

export function chipDefs(vms: StudentVM[]): { key: StatusKey | null; label: string; count: number }[] {
  const count = (k: StatusKey) => vms.filter(v => v.statusKey === k).length
  return [
    { key: null, label: 'Tous', count: vms.length },
    { key: 'complet', label: 'Complet', count: count('complet') },
    { key: 'verif', label: 'À vérifier', count: count('verif') },
    { key: 'incomplet', label: 'Incomplet', count: count('incomplet') },
    { key: 'retard', label: 'En retard', count: count('retard') },
  ]
}

export function filterStudents(vms: StudentVM[], status: StatusKey | null, query: string): StudentVM[] {
  const q = normalize(query.trim())
  return vms.filter(v =>
    (!status || v.statusKey === status) &&
    (!q || normalize(v.name).includes(q))
  )
}

export function listSummary(vms: StudentVM[]): string {
  const done = vms.filter(v => v.statusKey === 'complet').length
  return `${vms.length} élève${p(vms.length)} confirmé${p(vms.length)} · ${done} dossier${p(done)} complet${p(done)}`
}

export function reminderNote(vm: StudentVM): string {
  if (vm.statusKey === 'complet') {
    return `Dossier complet — aucune relance prévue pour ${vm.firstName}.`
  }
  const due = vm.dueLabel ? ` (${vm.dueLabel})` : ''
  return `Relances automatiques par e-mail jusqu’à réception — ${vm.firstName} et ses parents reçoivent la liste des pièces attendues${due}.`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test lib/students`
Expected: PASS (all cases). If `rollupStudent`'s `TemplateInfo` typing rejects the cast, keep the `as TemplateInfo` cast — active templates always carry a deadline (DB-enforced), the empty-string fallback only types the field.

- [ ] **Step 5: Full gates + commit**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`

```bash
git add lib/students/directory.ts lib/students/__tests__/directory.test.ts
git commit -m "feat(students): directory derivations — StudentVM, chips, sort, filter

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Student reminder e-mail + `actions/students.ts`

**Files:**
- Modify: `lib/email.ts`
- Create: `actions/students.ts`
- Test: `lib/__tests__/email.test.ts` (extend the existing file if present; otherwise create `lib/__tests__/student-reminder-email.test.ts` following the existing e-mail test conventions in `lib/__tests__/`)

**Interfaces:**
- Consumes: `buildStudentVM`, `sortStudents`, `type StudentVM`, `type DirectoryTemplate` from Task 2; existing `esc`/`layout`/`send`/`STUDENT_FOOTER` internals of `lib/email.ts`; `CellMap` from `@/lib/dashboard/rollup`.
- Produces:
  - `sendStudentReminderEmail(opts: { to: string; studentName: string; exchangeName: string; items: { name: string; deadline: string | null }[] }): Promise<boolean>`
  - `getStudentsDirectory(exchangeId: string): Promise<{ students: StudentVM[] }>`
  - `remindStudent(exchangeId: string, studentId: string): Promise<{ reminded: boolean; skipped: boolean }>`

- [ ] **Step 1: Write the failing e-mail test**

Look at how existing tests in `lib/__tests__/` exercise e-mail builders (they mock `resend`). Add a test that asserts escaping + grouping:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send: sendMock } })) }))

import { sendStudentReminderEmail } from '@/lib/email'

describe('sendStudentReminderEmail', () => {
  beforeEach(() => {
    sendMock.mockClear()
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('lists every outstanding item and escapes user content', async () => {
    const ok = await sendStudentReminderEmail({
      to: 'x@y.fr', studentName: '<Yanis>', exchangeName: 'Espagne <2026>',
      items: [
        { name: 'Passeport', deadline: '2026-10-10' },
        { name: 'AST <sortie>', deadline: null },
      ],
    })
    expect(ok).toBe(true)
    const { subject, html } = sendMock.mock.calls[0][0]
    expect(subject).toBe('Rappel : ton dossier pour Espagne <2026>')
    expect(html).toContain('&lt;Yanis&gt;')
    expect(html).toContain('Espagne &lt;2026&gt;')
    expect(html).toContain('AST &lt;sortie&gt;')
    expect(html).toContain('Passeport')
    expect(html).toContain('10 oct') // frShortDate rendering
    expect(html).not.toContain('<Yanis>')
  })
})
```

Run: `pnpm test lib/__tests__` → Expected: FAIL (`sendStudentReminderEmail` not exported).

- [ ] **Step 2: Implement `sendStudentReminderEmail` in `lib/email.ts`**

Place next to `sendPhase2ChecklistEmail` (same list layout, tutoiement, `STUDENT_FOOTER`):

```ts
export async function sendStudentReminderEmail(opts: {
  to: string; studentName: string; exchangeName: string
  items: { name: string; deadline: string | null }[]
}): Promise<boolean> {
  const greeting = opts.studentName ? `Bonjour ${esc(opts.studentName)},` : 'Bonjour,'
  const n = opts.items.length
  const rows = opts.items.map(i =>
    `<li><strong>${esc(i.name)}</strong>${i.deadline ? ` — échéance ${esc(frShortDate(i.deadline))}` : ''}</li>`
  ).join('')
  const html = layout(`
    <p>${greeting}</p>
    <p>Il manque encore ${n === 1 ? 'cet élément' : 'ces éléments'} à ton dossier pour <strong>${esc(opts.exchangeName)}</strong> :</p>
    <ul>${rows}</ul>
    <p><a href="${APP_URL}/my-forms" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Compléter mon dossier</a></p>
  `, STUDENT_FOOTER)
  return send(opts.to, `Rappel : ton dossier pour ${opts.exchangeName}`, html, 'student reminder email')
}
```

Run: `pnpm test lib/__tests__` → Expected: PASS.

- [ ] **Step 3: Create `actions/students.ts`**

```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CellMap } from '@/lib/dashboard/rollup'
import {
  buildStudentVM, sortStudents,
  type StudentVM, type DirectoryTemplate,
} from '@/lib/students/directory'
import { sendStudentReminderEmail } from '@/lib/email'

// Throw unless the caller is an organizer whose school is on this exchange.
// Returns the school id. (Same shape as getTemplatesPage's scope check.)
async function assertOrganizerInExchange(
  supabase: SupabaseClient, userId: string, exchangeId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from('users').select('school_id, role').eq('id', userId).single()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  const { data: exchange } = await supabase
    .from('exchanges').select('school_a_id, school_b_id').eq('id', exchangeId).maybeSingle()
  if (!exchange || (exchange.school_a_id !== profile.school_id && exchange.school_b_id !== profile.school_id)) {
    throw new Error('Unauthorized')
  }
  return profile.school_id as string
}

export async function getStudentsDirectory(exchangeId: string): Promise<{ students: StudentVM[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const schoolId = await assertOrganizerInExchange(supabase, user.id, exchangeId)

  const [{ data: templates }, { data: enrollments }] = await Promise.all([
    supabase
      .from('form_templates')
      .select('id, name, type, kind, deadline')
      .eq('exchange_id', exchangeId)
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .order('created_at'),
    supabase.from('exchange_enrollments').select('user_id').eq('exchange_id', exchangeId),
  ])

  const enrolledIds = (enrollments ?? []).map((e: any) => e.user_id)
  const students: { id: string; full_name: string; email: string }[] = enrolledIds.length > 0
    ? ((await supabase
        .from('users').select('id, full_name, email')
        .in('id', enrolledIds).eq('school_id', schoolId).eq('role', 'student')
        .order('full_name')).data ?? [])
    : []
  if (students.length === 0) return { students: [] }

  const templateIds = (templates ?? []).map((t: any) => t.id)
  const studentIds = students.map(s => s.id)

  const [assignments, applications] = await Promise.all([
    templateIds.length > 0
      ? supabase
          .from('assignments')
          .select('id, template_id, student_id, submissions(status)')
          .in('template_id', templateIds)
          .in('student_id', studentIds)
          .then(r => r.data ?? [])
      : Promise.resolve([] as any[]),
    supabase
      .from('applications')
      .select('id, enrolled_user_id, data')
      .eq('exchange_id', exchangeId)
      .in('enrolled_user_id', studentIds)
      .then(r => r.data ?? []),
  ])

  const cellMap: CellMap = {}
  for (const a of assignments as any[]) {
    const submission = Array.isArray(a.submissions) ? a.submissions[0] : a.submissions
    cellMap[`${a.student_id}:${a.template_id}`] = { assignmentId: a.id, status: submission?.status }
  }
  const appByStudent = new Map<string, { id: string; data: Record<string, string> }>()
  for (const a of applications as any[]) {
    if (a.enrolled_user_id) appByStudent.set(a.enrolled_user_id, { id: a.id, data: a.data ?? {} })
  }

  const dirTemplates = (templates ?? []) as DirectoryTemplate[]
  const vms = students.map((s, i) =>
    buildStudentVM({
      student: s,
      application: appByStudent.get(s.id) ?? null,
      templates: dirTemplates,
      cellMap,
      avatarIndex: i,
    })
  )
  return { students: sortStudents(vms) }
}

const REMIND_COOLDOWN_MS = 24 * 3600 * 1000

// One grouped e-mail per student listing every outstanding pièce (mirrors the
// daily cron's per-student grouping). Cooldown: if every outstanding assignment
// was already reminded < 24h ago, skip; otherwise send the full list and stamp
// ALL outstanding assignments.
export async function remindStudent(
  exchangeId: string, studentId: string,
): Promise<{ reminded: boolean; skipped: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const schoolId = await assertOrganizerInExchange(supabase, user.id, exchangeId)

  const { data: student } = await supabase
    .from('users').select('email, full_name')
    .eq('id', studentId).eq('school_id', schoolId).eq('role', 'student').maybeSingle()
  if (!student) throw new Error('Unauthorized')

  const { data: exchange } = await supabase
    .from('exchanges').select('name').eq('id', exchangeId).single()

  const { data: templates } = await supabase
    .from('form_templates')
    .select('id, name, deadline')
    .eq('exchange_id', exchangeId).eq('school_id', schoolId).eq('status', 'active')
  const templateIds = (templates ?? []).map((t: any) => t.id)
  const byId = new Map((templates ?? []).map((t: any) => [t.id, t]))
  if (templateIds.length === 0) throw new Error('Le dossier est complet — rien à relancer.')

  const { data: rows } = await supabase
    .from('assignments')
    .select('id, template_id, last_reminded_at, submissions(status)')
    .eq('student_id', studentId)
    .in('template_id', templateIds)

  const outstanding = ((rows ?? []) as any[]).filter(r => {
    const submission = Array.isArray(r.submissions) ? r.submissions[0] : r.submissions
    const status = submission?.status ?? null
    return status !== 'submitted' && status !== 'approved'
  })
  if (outstanding.length === 0) throw new Error('Le dossier est complet — rien à relancer.')

  const cutoff = Date.now() - REMIND_COOLDOWN_MS
  const fresh = outstanding.filter(r =>
    !r.last_reminded_at || new Date(r.last_reminded_at).getTime() <= cutoff)
  if (fresh.length === 0) return { reminded: false, skipped: true }

  if (!student.email) throw new Error('Aucune adresse e-mail pour cet élève.')
  const items = outstanding.map(r => {
    const t = byId.get(r.template_id)
    return { name: (t?.name as string) ?? '—', deadline: (t?.deadline as string | null) ?? null }
  })
  const ok = await sendStudentReminderEmail({
    to: student.email, studentName: student.full_name ?? '',
    exchangeName: exchange?.name ?? '', items,
  })
  if (!ok) throw new Error('L’e-mail de relance n’a pas pu être envoyé. Réessayez.')

  await supabase.from('assignments')
    .update({ last_reminded_at: new Date().toISOString() })
    .in('id', outstanding.map(r => r.id))
  revalidatePath('/students')
  return { reminded: true, skipped: false }
}
```

- [ ] **Step 4: Gates + commit**

Run: `pnpm lint && pnpm test && npx tsc --noEmit` → Expected: all green.

```bash
git add lib/email.ts lib/__tests__ actions/students.ts
git commit -m "feat(students): grouped student reminder email + directory/remind actions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `/students` page — StudentsView + StudentDetail

**Files:**
- Create: `app/(organizer)/students/page.tsx`, `components/students/StudentsView.tsx`, `components/students/StudentDetail.tsx`
- Test: `components/students/__tests__/StudentsView.test.tsx`

**Interfaces:**
- Consumes: `getStudentsDirectory`, `remindStudent` (Task 3); `chipDefs`, `filterStudents`, `listSummary`, `reminderNote`, `type StudentVM`, `type StatusKey` (Task 2); `useShellUi` from `@/components/shell/ShellUiContext`; `StatusPill` from `@/components/dashboard/StatusPill`; `EmptyDashboard`; `resolveActiveExchange`/`ACTIVE_EXCHANGE_COOKIE`.
- Produces: the `/students` route. Checklist rows with a submission link to `/exchanges/{exchangeId}/submissions/{assignmentId}`; the « Candidature » button links to `/applications?id={applicationId}`.
- Layout note (accepted deviation, record in ledger): the demo scrolls list and detail independently inside a fixed viewport; our shell scrolls the whole `<main>`. Render two normal columns (`flex gap-5`, list `w-[340px] flex-none`, detail `flex-1` white card) that scroll with the page.

- [ ] **Step 1: Write the failing component tests**

Create `components/students/__tests__/StudentsView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
let listSearch = ''
vi.mock('@/components/shell/ShellUiContext', () => ({
  useShellUi: () => ({
    listSearch, setListSearch: vi.fn(), addRequestId: 0,
    requestAdd: vi.fn(), openNewExchange: vi.fn(),
  }),
}))
const remind = vi.fn().mockResolvedValue({ reminded: true, skipped: false })
vi.mock('@/actions/students', () => ({ remindStudent: (...a: unknown[]) => remind(...a) }))
import { StudentsView } from '@/components/students/StudentsView'
import type { StudentVM } from '@/lib/students/directory'

const base: StudentVM = {
  id: 's1', name: 'Camille Laurent', firstName: 'Camille', initials: 'CL', avatarBg: '#2456E6',
  statusKey: 'complet', overall: { kind: 'ok', label: 'Complet' }, summary: 'Dossier complet',
  sub: 'Première · 1re G2 · Français',
  identity: [
    { l: 'Nom', v: 'Laurent' }, { l: 'Prénom', v: 'Camille' },
    { l: 'Date de naissance', v: '14/03/2009' }, { l: 'Niveau 26-27', v: 'Première' },
    { l: 'Classe', v: '1re G2' }, { l: 'Langue maternelle', v: 'Français' },
    { l: 'E-mail', v: 'camille@email.fr' }, { l: 'Téléphone', v: '06 12 24 37 52' },
  ],
  parents: [{ role: 'PÈRE', name: 'Marc Laurent', tel: '06 22 34 51 61', email: 'marc@email.fr' }],
  applicationId: 'app1',
  checklist: [
    { assignmentId: 'a1', label: 'Formulaire de santé', group: 'Formulaire', pill: { kind: 'ok', label: 'Fourni' }, reviewable: true },
  ],
  provided: 1, total: 1, pct: 100, dueLabel: 'Échéance 10 oct',
}
const second: StudentVM = {
  ...base, id: 's2', name: 'Yanis Benali', firstName: 'Yanis', initials: 'YB',
  statusKey: 'retard', overall: { kind: 'bad', label: 'En retard' },
  summary: 'Échéance dépassée — 2 pièces attendues', applicationId: null,
  checklist: [
    { assignmentId: 'a2', label: 'Passeport', group: 'Document', pill: { kind: 'bad', label: 'Manquant' }, reviewable: false },
    { assignmentId: 'a3', label: 'AST — sortie du territoire', group: 'Document', pill: { kind: 'info', label: 'À vérifier' }, reviewable: true },
  ],
  provided: 0, total: 2, pct: 0,
}

describe('StudentsView', () => {
  beforeEach(() => { listSearch = ''; remind.mockClear() })

  it('renders subline, chips with counts, and selects the first student', () => {
    render(<StudentsView exchangeId="ex1" students={[second, base]} />)
    expect(screen.getByRole('heading', { name: 'Élèves' })).toBeInTheDocument()
    expect(screen.getByText('2 élèves confirmés · 1 dossier complet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Tous/ })).toBeInTheDocument()
    // first in the given order (already status-sorted by the action) is selected
    expect(screen.getByText('Première · 1re G2 · Français')).toBeInTheDocument()
  })

  it('chip filter narrows the list; empty filter shows the demo copy', () => {
    render(<StudentsView exchangeId="ex1" students={[second, base]} />)
    fireEvent.click(screen.getByRole('button', { name: /À vérifier/ }))
    expect(screen.getByText('Aucun élève ne correspond au filtre.')).toBeInTheDocument()
  })

  it('search filters accent-insensitively via the shell field', () => {
    listSearch = 'yanis'
    render(<StudentsView exchangeId="ex1" students={[second, base]} />)
    expect(screen.queryAllByText('Camille Laurent')).toHaveLength(0)
    expect(screen.getAllByText('Yanis Benali').length).toBeGreaterThan(0)
  })

  it('clicking a row switches the detail panel', () => {
    render(<StudentsView exchangeId="ex1" students={[second, base]} />)
    fireEvent.click(screen.getByRole('button', { name: /Camille Laurent/ }))
    expect(screen.getByText('Marc Laurent')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Candidature' })).toHaveAttribute('href', '/applications?id=app1')
  })

  it('detail: reviewable checklist rows link to the review page, missing ones do not', () => {
    render(<StudentsView exchangeId="ex1" students={[second, base]} />)
    expect(screen.getByRole('link', { name: /AST — sortie du territoire/ }))
      .toHaveAttribute('href', '/exchanges/ex1/submissions/a3')
    expect(screen.queryByRole('link', { name: /Passeport/ })).toBeNull()
  })

  it('Relancer calls the action and flashes the result; disabled when complete', async () => {
    render(<StudentsView exchangeId="ex1" students={[second, base]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }))
    expect(await screen.findByText('Relance envoyée.')).toBeInTheDocument()
    expect(remind).toHaveBeenCalledWith('ex1', 's2')
    fireEvent.click(screen.getByRole('button', { name: /Camille Laurent/ }))
    expect(screen.getByRole('button', { name: 'Relancer' })).toBeDisabled()
  })

  it('cooldown result shows the skipped message', async () => {
    remind.mockResolvedValueOnce({ reminded: false, skipped: true })
    render(<StudentsView exchangeId="ex1" students={[second, base]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }))
    expect(await screen.findByText('Déjà relancé récemment — réessayez plus tard.')).toBeInTheDocument()
  })

  it('no application: Candidature hidden, identity note shown', () => {
    render(<StudentsView exchangeId="ex1" students={[second, base]} />)
    expect(screen.queryByRole('link', { name: 'Candidature' })).toBeNull()
    expect(screen.getByText('Candidature introuvable pour cet élève.')).toBeInTheDocument()
  })
})
```

Run: `pnpm test components/students` → Expected: FAIL (module not found).

- [ ] **Step 2: Implement `components/students/StudentsView.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useShellUi } from '@/components/shell/ShellUiContext'
import {
  chipDefs, filterStudents, listSummary,
  type StudentVM, type StatusKey,
} from '@/lib/students/directory'
import { StudentDetail } from './StudentDetail'

export function StudentsView({ exchangeId, students }: { exchangeId: string; students: StudentVM[] }) {
  const { listSearch } = useShellUi()
  const [statusFilter, setStatusFilter] = useState<StatusKey | null>(null)
  const [selId, setSelId] = useState<string | null>(null)

  const chips = chipDefs(students)
  const visible = filterStudents(students, statusFilter, listSearch)
  const selected = visible.find(v => v.id === selId) ?? visible[0] ?? null

  return (
    <div>
      <div className="flex gap-5">
        {/* list column */}
        <div className="w-[340px] flex-none">
          <div className="mb-[13px]">
            <h1 className="mb-1 font-display text-[25px] font-bold leading-[1.1] tracking-[-.02em]">Élèves</h1>
            <p className="text-[13px] text-muted-foreground">{listSummary(students)}</p>
          </div>
          <div className="mb-[13px] flex flex-wrap gap-1.5">
            {chips.map(c => {
              const active = statusFilter === c.key
              return (
                <button
                  key={c.label} type="button"
                  onClick={() => setStatusFilter(active || c.key === null ? null : c.key)}
                  className={`inline-flex items-center gap-[7px] whitespace-nowrap rounded-pill border px-3 py-1.5 text-[12.5px] font-medium ${
                    active || (c.key === null && statusFilter === null)
                      ? 'border-navy bg-navy text-white'
                      : 'border-frame-dashed bg-card text-foreground hover:border-placeholder'
                  }`}
                >
                  {c.label}
                  <span className={`rounded-pill px-[7px] py-px font-mono text-[10.5px] font-semibold ${
                    active || (c.key === null && statusFilter === null)
                      ? 'bg-white/15 text-white' : 'bg-background text-tertiary'
                  }`}>
                    {c.count}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-col gap-2">
            {visible.map(s => {
              const isSel = selected?.id === s.id
              return (
                <button
                  key={s.id} type="button" onClick={() => setSelId(s.id)}
                  className={`flex items-center gap-[11px] rounded-xl bg-card p-3 text-left ${
                    isSel ? 'border-[1.5px] border-brand shadow-float' : 'border hover:border-placeholder'
                  }`}
                >
                  <span
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ background: s.avatarBg }}
                  >
                    {s.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-foreground">{s.name}</span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-tertiary">{s.summary}</span>
                  </span>
                  <StatusDot kind={s.overall.kind} />
                </button>
              )
            })}
            {visible.length === 0 && (
              <p className="px-2.5 py-10 text-center text-[13px] text-tertiary">
                Aucun élève ne correspond au filtre.
              </p>
            )}
          </div>
        </div>

        {/* detail panel */}
        <div className="min-w-0 flex-1 rounded-2xl border bg-card px-[30px] py-7">
          {selected && <StudentDetail key={selected.id} vm={selected} exchangeId={exchangeId} />}
          {!selected && (
            <p className="py-10 text-center text-[13px] text-tertiary">Sélectionnez un élève.</p>
          )}
        </div>
      </div>
    </div>
  )
}

const DOT: Record<string, string> = {
  ok: 'bg-success-text', info: 'bg-tint-text', warn: 'bg-warn-text', bad: 'bg-danger-text', neutral: 'bg-placeholder',
}
function StatusDot({ kind }: { kind: string }) {
  return <span className={`h-[9px] w-[9px] flex-none rounded-full ${DOT[kind] ?? DOT.neutral}`} />
}
```

Note: if the Phase-1 token set has no `*-text` background utility that renders (they are color tokens usable as `bg-`), keep `bg-success-text` etc. — Tailwind generates `bg-` for any color token. Verify against `tailwind.config.ts` while implementing; if the dot colors look wrong in the browser, switch to the pill background tokens (`bg-success`…) — the dot must read as saturated status color.

- [ ] **Step 3: Implement `components/students/StudentDetail.tsx`**

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { remindStudent } from '@/actions/students'
import { reminderNote, type StudentVM } from '@/lib/students/directory'

export function StudentDetail({ vm, exchangeId }: { vm: StudentVM; exchangeId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRemind() {
    setBusy(true); setFlash(null); setError(null)
    try {
      const res = await remindStudent(exchangeId, vm.id)
      setFlash(res.reminded ? 'Relance envoyée.' : 'Déjà relancé récemment — réessayez plus tard.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setBusy(false)
  }

  const complete = vm.statusKey === 'complet'

  return (
    <div>
      {/* header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-[15px]">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
            style={{ background: vm.avatarBg }}
          >
            {vm.initials}
          </span>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-display text-[22px] font-bold tracking-[-.02em] text-foreground">{vm.name}</span>
              <StatusPill pill={vm.overall} />
            </div>
            {vm.sub && <div className="mt-1 text-[13px] text-tertiary">{vm.sub}</div>}
          </div>
        </div>
        <div className="flex flex-none gap-[9px]">
          <button
            type="button" onClick={handleRemind} disabled={busy || complete}
            className="rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Envoi…' : 'Relancer'}
          </button>
          {vm.applicationId && (
            <Link
              href={`/applications?id=${vm.applicationId}`}
              className="rounded-[9px] border bg-card px-4 py-2.5 text-[13px] font-semibold text-foreground hover:bg-hoverrow"
            >
              Candidature
            </Link>
          )}
        </div>
      </div>
      {(flash || error) && (
        <p className={`mb-4 text-[12.5px] font-medium ${error ? 'text-danger-text' : 'text-success-text'}`}>
          {error ?? flash}
        </p>
      )}

      <div className="grid grid-cols-1 gap-[30px] lg:grid-cols-[1fr_1.1fr]">
        {/* identity + parents */}
        <div>
          <div className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">Identité</div>
          {!vm.applicationId && (
            <p className="mb-2 text-[12.5px] text-tertiary">Candidature introuvable pour cet élève.</p>
          )}
          <div className="mb-[22px]">
            {vm.identity.map(f => (
              <div key={f.l} className="flex justify-between gap-4 border-b border-subtle py-[8.5px]">
                <span className="text-[13px] text-tertiary">{f.l}</span>
                <span className="text-right text-[13px] font-medium text-foreground">{f.v}</span>
              </div>
            ))}
          </div>
          {vm.parents.length > 0 && (
            <>
              <div className="mb-2.5 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">Parents</div>
              <div className="flex flex-col gap-2.5">
                {vm.parents.map(par => (
                  <div key={par.role} className="flex justify-between gap-3 rounded-[11px] border border-subtle px-[15px] py-[13px]">
                    <div>
                      <div className="mb-1 font-mono text-[10.5px] font-medium text-placeholder">{par.role}</div>
                      <div className="text-[13.5px] font-semibold text-foreground">{par.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[12.5px] text-muted-foreground">{par.tel}</div>
                      <div className="mt-0.5 text-xs text-tertiary">{par.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* dossier */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2.5">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">Dossier</div>
            {vm.dueLabel && <span className="font-mono text-[11px] font-medium text-tertiary">{vm.dueLabel}</span>}
          </div>
          <div className="mb-1 h-1.5 overflow-hidden rounded-pill bg-background">
            <BarFill kind={vm.overall.kind} pct={vm.pct} />
          </div>
          <div className="mb-[11px] font-mono text-[11px] font-medium text-tertiary">
            {vm.provided}/{vm.total} pièces fournies
          </div>
          <div className="overflow-hidden rounded-xl border border-subtle">
            {vm.checklist.map(item => {
              const inner = (
                <>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-foreground">{item.label}</span>
                    <span className="mt-px block font-mono text-[10px] text-placeholder">{item.group}</span>
                  </span>
                  <StatusPill pill={item.pill} />
                </>
              )
              const cls = 'flex items-center justify-between gap-2.5 border-b border-subtle px-3.5 py-[11px] last:border-b-0'
              return item.reviewable ? (
                <Link key={item.assignmentId} href={`/exchanges/${exchangeId}/submissions/${item.assignmentId}`}
                  className={`${cls} hover:bg-hoverrow`}>
                  {inner}
                </Link>
              ) : (
                <div key={item.assignmentId} className={cls}>{inner}</div>
              )
            })}
            {vm.checklist.length === 0 && (
              <p className="px-3.5 py-6 text-center text-[12.5px] text-tertiary">Aucune pièce demandée pour l’instant.</p>
            )}
          </div>
          <div className="mt-3.5 flex items-center gap-[9px] rounded-[11px] bg-hoverrow px-[15px] py-[13px]">
            <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] bg-brand text-[13px] text-white">↻</span>
            <span className="text-[12.5px] leading-[1.45] text-muted-foreground">{reminderNote(vm)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const BAR: Record<string, string> = {
  ok: 'bg-success-text', info: 'bg-tint-text', warn: 'bg-warn-text', bad: 'bg-danger-text', neutral: 'bg-placeholder',
}
function BarFill({ kind, pct }: { kind: string; pct: number }) {
  return <div className={`h-full rounded-pill ${BAR[kind] ?? BAR.neutral}`} style={{ width: `${pct}%` }} />
}
```

- [ ] **Step 4: Implement `app/(organizer)/students/page.tsx`**

Mirror `app/(organizer)/applications/page.tsx`:

```tsx
import { cookies } from 'next/headers'
import { getExchanges } from '@/actions/exchanges'
import { getStudentsDirectory } from '@/actions/students'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { StudentsView } from '@/components/students/StudentsView'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'
import Link from 'next/link'

export default async function StudentsPage() {
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  const { students } = await getStudentsDirectory(active.id)

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <h3 className="font-display text-2xl font-bold tracking-tight text-navy">
          Aucun élève confirmé pour cette session.
        </h3>
        <p className="text-muted-foreground">
          Les élèves apparaissent ici une fois leur candidature acceptée et leur compte créé.{' '}
          <Link href="/applications" className="font-semibold text-brand hover:underline">
            Voir les candidatures
          </Link>
        </p>
      </div>
    )
  }
  return <StudentsView exchangeId={active.id} students={students} />
}
```

- [ ] **Step 5: Run the component tests**

Run: `pnpm test components/students` → Expected: PASS.

- [ ] **Step 6: Full gates + commit**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`

```bash
git add app/\(organizer\)/students/page.tsx components/students
git commit -m "feat(students): /students master-detail page (Élèves)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Shell — rail items, students top bar, settings top bar, archived pills

**Files:**
- Modify: `components/shell/RailIcons.tsx`, `components/shell/OrganizerShell.tsx`, `components/shell/SessionSelector.tsx`, `app/(organizer)/layout.tsx`, `lib/exchange-session.ts`
- Test: extend `components/shell/__tests__/OrganizerShell.test.tsx` (follow its existing mocking conventions) and `lib/__tests__/exchange-session.test.ts` if present (create the lib test if missing)

**Interfaces:**
- Consumes: existing `ExchangeOption`, `RailItem`, `listPage` mechanism.
- Produces: `ExchangeOption` gains `archived: boolean`; `OrganizerShell` gains prop `schoolName: string`; `resolveActiveExchange` fallback prefers non-archived. Rail: Élèves → `/students` (needs an active exchange), Réglages → `/settings` (always).

- [ ] **Step 1: Icons**

Append to `components/shell/RailIcons.tsx` (from the handoff rail markup):

```tsx
export function IconStudents() {
  return (
    <div className="flex gap-[2px]">
      <div className="h-2 w-2 rounded-full bg-current" />
      <div className="h-2 w-2 rounded-full bg-current" />
    </div>
  )
}

export function IconSettings() {
  return (
    <div className="flex h-[15px] w-[15px] items-center justify-center rounded-full border-[1.5px] border-current">
      <div className="h-[5px] w-[5px] rounded-full bg-current" />
    </div>
  )
}
```

- [ ] **Step 2: `lib/exchange-session.ts` — archived-aware fallback**

```ts
export const ACTIVE_EXCHANGE_COOKIE = 'ee_active_exchange'

// `exchanges` must be ordered most-recent-first (created_at desc).
// An explicit cookie selection wins even if archived (dossiers stay
// consultable); the fallback prefers the most recent NON-archived exchange.
export function resolveActiveExchange<T extends { id: string; archived?: boolean }>(
  exchanges: T[],
  cookieValue: string | undefined
): T | null {
  if (exchanges.length === 0) return null
  return (
    exchanges.find((e) => e.id === cookieValue) ??
    exchanges.find((e) => !e.archived) ??
    exchanges[0]
  )
}
```

Add/extend the lib test:

```ts
import { describe, it, expect } from 'vitest'
import { resolveActiveExchange } from '@/lib/exchange-session'

describe('resolveActiveExchange', () => {
  const ex = [
    { id: 'newest', archived: true },
    { id: 'older', archived: false },
  ]
  it('cookie selection wins even when archived', () => {
    expect(resolveActiveExchange(ex, 'newest')?.id).toBe('newest')
  })
  it('fallback prefers the most recent non-archived exchange', () => {
    expect(resolveActiveExchange(ex, undefined)?.id).toBe('older')
  })
  it('all archived → most recent anyway', () => {
    expect(resolveActiveExchange([{ id: 'a', archived: true }], undefined)?.id).toBe('a')
  })
})
```

- [ ] **Step 3: `app/(organizer)/layout.tsx`**

- Change the exchanges select to `'id, name, year, phase, archived_at'` and map:

```ts
const exchanges: ExchangeOption[] = ((exchangeRows ?? []) as any[]).map(e => ({
  id: e.id, name: e.name, year: e.year, phase: e.phase, archived: !!e.archived_at,
}))
```

- Pass the school name to the shell:

```tsx
<OrganizerShell
  exchanges={exchanges}
  activeExchangeId={active?.id ?? null}
  organizerName={profile.full_name}
  schoolName={school?.name ?? ''}
  needsSchoolName={school?.name === ''}
>
```

- [ ] **Step 4: `components/shell/OrganizerShell.tsx`**

1. `export type ExchangeOption = { id: string; name: string; year: number; phase: 1 | 2; archived: boolean }`
2. Add `schoolName: string` to the props (after `organizerName`).
3. Import and add rail items — inside the existing `{active && <>…</>}` block, after Docs:

```tsx
<RailItem href="/students" label="Élèves" active={pathname.startsWith('/students')}>
  <IconStudents />
</RailItem>
```

   and after that block (always rendered), before the closing `</div>` of the rail item list:

```tsx
<RailItem href="/settings" label="Réglages" active={pathname.startsWith('/settings')}>
  <IconSettings />
</RailItem>
```

4. Extend `listPage`:

```ts
const listPage = pathname.startsWith('/forms') ? 'forms'
  : pathname.startsWith('/documents') ? 'docs'
  : pathname.startsWith('/students') ? 'students' : null
const isSettings = pathname.startsWith('/settings')
```

5. Top-bar left side: when `isSettings`, render only the school name (no session selector, no phase pill — per the Réglages design):

```tsx
<div className="flex items-center gap-3.5">
  {isSettings ? (
    <span className="font-display text-base font-semibold text-navy">{schoolName}</span>
  ) : active ? (
    <>
      <SessionSelector … />
      <span className="rounded-pill bg-tint px-3 py-1 font-mono text-[11px] font-semibold text-tint-text">
        {active.archived ? 'Archivé'
          : active.phase === 1 ? 'Phase 1 · Recrutement' : 'Phase 2 · Préparation'}
      </span>
    </>
  ) : (
    /* existing « + Nouvel échange » button unchanged */
  )}
</div>
```

   For the archived pill use neutral colors: replace the pill `className` with a conditional — archived → `bg-subtle text-muted-foreground`, else the existing `bg-tint text-tint-text`.

6. Top-bar right side becomes three mutually exclusive branches (settings shows nothing):

```tsx
{!isSettings && active && listPage === null && ( /* existing invite Link unchanged */ )}
{!isSettings && active && listPage === 'students' && (
  <div className="flex items-center gap-3">
    <input
      type="search"
      value={listSearch}
      onChange={(e) => setListSearch(e.target.value)}
      placeholder="Rechercher un élève…"
      className="h-[38px] w-[220px] rounded-[9px] border bg-hoverrow px-3.5 text-[13px] placeholder:text-placeholder focus:border-brand focus:outline-none"
    />
    <Link
      href={`/exchanges/${active.id}#invite`}
      className="flex h-[38px] items-center gap-1.5 rounded-[9px] bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-hover"
    >
      <span className="text-base leading-none">+</span> Inviter des élèves
    </Link>
  </div>
)}
{!isSettings && active && (listPage === 'forms' || listPage === 'docs') && ( /* existing search + add-button block, with its listPage === 'forms' ternaries unchanged */ )}
```

- [ ] **Step 5: `components/shell/SessionSelector.tsx` — archived rows**

In the dropdown row, append an « Archivé » mini-pill after the name for archived exchanges:

```tsx
<span className="flex items-center gap-2">
  {ex.name}
  {ex.archived && (
    <span className="rounded-pill bg-subtle px-2 py-px text-[10px] font-semibold text-muted-foreground">Archivé</span>
  )}
</span>
```

- [ ] **Step 6: Update tests**

Extend `components/shell/__tests__/OrganizerShell.test.tsx` (reuse its existing render helper/mocks; every existing render call gains `schoolName="Lycée Mistral"` and `archived: false` on its exchange fixtures):

- `/settings` pathname → school name visible, no session selector button, no search input, no « + Inviter des élèves ».
- `/students` pathname → placeholder « Rechercher un élève… » present AND the « + Inviter des élèves » link present with `href="/exchanges/ex1#invite"`.
- archived active exchange → top-bar pill text « Archivé ».
- rail contains links « Élèves » (`/students`) and « Réglages » (`/settings`); with zero exchanges, « Réglages » still renders while « Élèves » does not.

Run: `pnpm test components/shell lib` → Expected: PASS.

- [ ] **Step 7: Full gates + commit**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`

```bash
git add components/shell/RailIcons.tsx components/shell/OrganizerShell.tsx components/shell/SessionSelector.tsx app/\(organizer\)/layout.tsx lib/exchange-session.ts components/shell/__tests__ lib/__tests__
git commit -m "feat(shell): Élèves + Réglages rail items, students/settings top bars, archived pills

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: HIBP check + profile & password actions

**Files:**
- Create: `lib/auth/hibp.ts`, `actions/settings.ts` (first slice)
- Test: `lib/auth/__tests__/hibp.test.ts`

**Interfaces:**
- Consumes: `enforceRateLimit` from `@/lib/rate-limit`; `createClient` (session) from `@/lib/supabase/server`; `createClient as createBareClient` from `@supabase/supabase-js` (current-password verification without touching session cookies).
- Produces:
  - `isPasswordPwned(password: string): Promise<boolean>` (fail-open), `passwordPolicyError(pw: string): string | null`, `PWNED_MESSAGE`
  - `updateProfile(input: { fullName: string; phone: string; title: string; schoolName: string }): Promise<void>`
  - `changePassword(currentPassword: string, newPassword: string): Promise<void>`

- [ ] **Step 1: Write the failing HIBP tests**

Create `lib/auth/__tests__/hibp.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { isPasswordPwned, passwordPolicyError } from '@/lib/auth/hibp'

// SHA-1('password') = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
// prefix 5BAA6, suffix 1E4C9B93F3F0682250B6CF8331B7EE68FD8
const SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8'

afterEach(() => vi.unstubAllGlobals())

describe('isPasswordPwned', () => {
  it('returns true when the suffix appears with a positive count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:2\r\n${SUFFIX}:1387`,
    }))
    expect(await isPasswordPwned('password')).toBe(true)
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('https://api.pwnedpasswords.com/range/5BAA6')
  })

  it('returns false when the suffix is absent or zero-padded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:2\r\n${SUFFIX}:0`,
    }))
    expect(await isPasswordPwned('password')).toBe(false)
  })

  it('fails open on non-OK responses and on network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => '' }))
    expect(await isPasswordPwned('password')).toBe(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await isPasswordPwned('password')).toBe(false)
  })
})

describe('passwordPolicyError', () => {
  it('rejects short passwords, accepts 8+', () => {
    expect(passwordPolicyError('court')).toBe('Le mot de passe doit contenir au moins 8 caractères.')
    expect(passwordPolicyError('longenough')).toBeNull()
  })
})
```

Run: `pnpm test lib/auth` → Expected: FAIL (module not found).

- [ ] **Step 2: Implement `lib/auth/hibp.ts`**

```ts
// Have-I-Been-Pwned k-anonymity range check (project decision: leaked-password
// protection is Pro-tier on Supabase, so we self-implement on password-set flows).
// Fails OPEN: an HIBP outage must never block a legitimate password change.

export const PWNED_MESSAGE =
  'Ce mot de passe apparaît dans des fuites de données connues — choisissez-en un autre.'

export function passwordPolicyError(pw: string): string | null {
  return pw.length >= 8 ? null : 'Le mot de passe doit contenir au moins 8 caractères.'
}

export async function isPasswordPwned(password: string): Promise<boolean> {
  try {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))
    const hex = Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
    const prefix = hex.slice(0, 5)
    const suffix = hex.slice(5)
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return false
    const body = await res.text()
    return body.split('\n').some(line => {
      const [sfx, count] = line.trim().split(':')
      return sfx === suffix && parseInt(count ?? '0', 10) > 0
    })
  } catch {
    return false
  }
}
```

Run: `pnpm test lib/auth` → Expected: PASS.

- [ ] **Step 3: Create `actions/settings.ts` (profile + password slice)**

```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createBareClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { enforceRateLimit } from '@/lib/rate-limit'
import { isPasswordPwned, passwordPolicyError, PWNED_MESSAGE } from '@/lib/auth/hibp'

type OrganizerCtx = { userId: string; schoolId: string; orgRole: 'owner' | 'admin'; email: string; fullName: string }

async function getOrganizerCtx(supabase: SupabaseClient): Promise<OrganizerCtx> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: profile } = await supabase
    .from('users').select('school_id, role, org_role, email, full_name').eq('id', user.id).single()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  return {
    userId: user.id, schoolId: profile.school_id,
    orgRole: (profile.org_role ?? 'admin') as 'owner' | 'admin',
    email: profile.email, fullName: profile.full_name,
  }
}

function assertOwner(ctx: OrganizerCtx): void {
  if (ctx.orgRole !== 'owner') throw new Error('Réservé au propriétaire du compte.')
}

export async function updateProfile(input: {
  fullName: string; phone: string; title: string; schoolName: string
}): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)

  const fullName = input.fullName.trim()
  const schoolName = input.schoolName.trim()
  if (!fullName) throw new Error('Le nom ne peut pas être vide.')
  if (!schoolName) throw new Error('Le nom de l’établissement ne peut pas être vide.')

  const { error: userError } = await supabase.from('users').update({
    full_name: fullName,
    phone: input.phone.trim() || null,
    title: input.title.trim() || null,
  }).eq('id', ctx.userId)
  if (userError) throw userError

  // schools.name is the only client-updatable school column (column grant
  // from 20260701000001) — RLS scopes the row to the caller's school.
  const { error: schoolError } = await supabase.from('schools')
    .update({ name: schoolName }).eq('id', ctx.schoolId)
  if (schoolError) throw schoolError

  revalidatePath('/settings')
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  await enforceRateLimit(`pwchange:${ctx.userId}`, 5, 3600)

  const policyError = passwordPolicyError(newPassword)
  if (policyError) throw new Error(policyError)

  // Verify the current password on a throwaway client so the session cookies
  // of THIS request are never touched.
  const bare = createBareClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error: signInError } = await bare.auth.signInWithPassword({
    email: ctx.email, password: currentPassword,
  })
  if (signInError) throw new Error('Mot de passe actuel incorrect.')

  if (await isPasswordPwned(newPassword)) throw new Error(PWNED_MESSAGE)

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new Error('Le mot de passe n’a pas pu être mis à jour. Réessayez.')
}
```

- [ ] **Step 4: Gates + commit**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`

```bash
git add lib/auth/hibp.ts lib/auth/__tests__/hibp.test.ts actions/settings.ts
git commit -m "feat(settings): HIBP check + updateProfile/changePassword actions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: French € plan display + billing overview

**Files:**
- Create: `lib/billing/display.ts`
- Modify: `components/exchanges/ExchangesView.tsx`, `app/(organizer)/exchanges/page.tsx`, `app/billing/page.tsx`, `actions/settings.ts`
- Test: `lib/billing/__tests__/display.test.ts`; update any existing tests asserting `Starter`/`$299` etc.

**Interfaces:**
- Consumes: `PLAN_EXCHANGE_CAP`, `hasActivePlan`, `exchangeCap` from `@/lib/billing/limits`; `PlanKey` from `@/lib/billing/plans`; `getStripe` from `@/lib/billing/stripe`; `createAdminClient`.
- Produces:
  - `PLAN_LABEL_FR`, `PLAN_PRICE_FR`, `PLAN_DESC_FR`, `TRIAL_LABEL`, `TRIAL_PRICE`, `TRIAL_DESC`, `planCapLabel(key)`, `usageLine(used, cap): { label: string; pct: number }`
  - `getBillingOverview(): Promise<BillingOverview>` in `actions/settings.ts` (owner-only)

- [ ] **Step 1: Write the failing display tests**

Create `lib/billing/__tests__/display.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  PLAN_LABEL_FR, PLAN_PRICE_FR, planCapLabel, usageLine,
} from '@/lib/billing/display'

describe('plan display', () => {
  it('French labels and € prices (user decision 2026-07-04)', () => {
    expect(PLAN_LABEL_FR).toEqual({ starter: 'Essentiel', growth: 'Association', scale: 'Réseau' })
    expect(PLAN_PRICE_FR).toEqual({ starter: '199 €', growth: '499 €', scale: '799 €' })
  })
  it('cap labels', () => {
    expect(planCapLabel('starter')).toBe('2 échanges')
    expect(planCapLabel('scale')).toBe('Échanges illimités')
  })
  it('usage line: bounded plans', () => {
    expect(usageLine(1, 2)).toEqual({ label: '1 / 2 échanges utilisé', pct: 50 })
    expect(usageLine(2, 2)).toEqual({ label: '2 / 2 échanges utilisés', pct: 100 })
    expect(usageLine(3, 2).pct).toBe(100) // clamped
    expect(usageLine(0, 1)).toEqual({ label: '0 / 1 échange utilisé', pct: 0 })
  })
  it('usage line: unlimited', () => {
    expect(usageLine(1, Infinity)).toEqual({ label: '1 échange actif · échanges illimités', pct: 6 })
    expect(usageLine(3, Infinity).label).toBe('3 échanges actifs · échanges illimités')
  })
})
```

Run: `pnpm test lib/billing` → Expected: FAIL (module not found).

- [ ] **Step 2: Implement `lib/billing/display.ts`**

```ts
// Single source for customer-facing plan display (labels, € prices, blurbs).
// Keys stay starter/growth/scale — only display is French (Réglages design).
import { PLAN_EXCHANGE_CAP } from './limits'
import type { PlanKey } from './plans'
import { p } from '@/lib/dashboard/rollup'

export const PLAN_LABEL_FR: Record<PlanKey, string> = {
  starter: 'Essentiel', growth: 'Association', scale: 'Réseau',
}
export const PLAN_PRICE_FR: Record<PlanKey, string> = {
  starter: '199 €', growth: '499 €', scale: '799 €',
}
export const PLAN_DESC_FR: Record<PlanKey, string> = {
  starter: 'Pour un organisateur indépendant.',
  growth: 'Pour les associations en pleine croissance.',
  scale: 'Pour les grands réseaux d’échanges.',
}
export const TRIAL_LABEL = 'Essai gratuit'
export const TRIAL_PRICE = '0 €'
export const TRIAL_DESC = 'Votre premier échange est offert — aucun paiement requis.'

export function planCapLabel(key: PlanKey): string {
  const cap = PLAN_EXCHANGE_CAP[key]
  return cap === Infinity ? 'Échanges illimités' : `${cap} échanges`
}

export function usageLine(used: number, cap: number): { label: string; pct: number } {
  if (cap === Infinity) {
    return { label: `${used} échange${p(used)} actif${p(used)} · échanges illimités`, pct: 6 }
  }
  return {
    label: `${used} / ${cap} échange${p(cap)} utilisé${p(used)}`,
    pct: cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0,
  }
}
```

Run: `pnpm test lib/billing` → Expected: PASS.

- [ ] **Step 3: Retrofit the three existing price/label sites**

1. `components/exchanges/ExchangesView.tsx`: delete the local `PLAN_LABEL` and `PLAN_PRICE` consts; import `PLAN_LABEL_FR`, `PLAN_PRICE_FR`, `planCapLabel` from `@/lib/billing/display`; replace usages (`PLAN_LABEL[key]` → `PLAN_LABEL_FR[key]`, `PLAN_PRICE[key]` → `PLAN_PRICE_FR[key]`, `PLAN_CAP_LABEL[key]` → `planCapLabel(key)`; delete the local `PLAN_CAP_LABEL`).
2. `app/(organizer)/exchanges/page.tsx`: delete the local `PLAN_LABEL`; import and use `PLAN_LABEL_FR` (the `?? school.plan` fallback stays).
3. `app/billing/page.tsx`: delete the local `PLAN_LABEL`; import and use `PLAN_LABEL_FR` (page copy otherwise unchanged — the full FR redesign of this page is screen 1f, Phase 6).
4. Update failing assertions in existing tests (`pnpm test` will point at them — expect `Essentiel`, `199 €` instead of `Starter`, `$299`).

- [ ] **Step 4: `getBillingOverview` in `actions/settings.ts`**

Append (import `createAdminClient` from `@/lib/supabase/admin`, `hasActivePlan`, `exchangeCap` from `@/lib/billing/limits`, `isPlanKey` from `@/lib/billing/plans`, `getStripe` from `@/lib/billing/stripe`, display consts from `@/lib/billing/display`, and `type Stripe from 'stripe'`):

```ts
export type BillingOverview = {
  planLabel: string; price: string; per: string; desc: string
  usageLabel: string; usagePct: number
  payment: { note: string; cta: string; href: string }
}

export async function getBillingOverview(): Promise<BillingOverview> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  assertOwner(ctx)

  const admin = createAdminClient()
  const { data: school } = await admin
    .from('schools')
    .select('subscription_status, plan, grace_until, stripe_customer_id')
    .eq('id', ctx.schoolId).single()
  if (!school) throw new Error('École introuvable.')

  const { count } = await supabase
    .from('exchanges')
    .select('id', { count: 'exact', head: true })
    .eq('school_a_id', ctx.schoolId)
  const used = count ?? 0

  const active = hasActivePlan(school)
  const planKey = active && isPlanKey(school.plan) ? school.plan : null
  const cap = exchangeCap(school)
  const usage = usageLine(used, cap)

  let payment = { note: 'Aucun moyen de paiement enregistré.', cta: 'Ajouter une carte', href: '/billing' }
  if (planKey && school.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const customer = await getStripe().customers.retrieve(school.stripe_customer_id, {
        expand: ['invoice_settings.default_payment_method'],
      })
      const card = !('deleted' in customer && customer.deleted)
        ? ((customer as Stripe.Customer).invoice_settings
            ?.default_payment_method as Stripe.PaymentMethod | null)?.card
        : null
      if (card) {
        const brand = card.brand.charAt(0).toUpperCase() + card.brand.slice(1)
        const exp = `${String(card.exp_month).padStart(2, '0')}/${String(card.exp_year).slice(-2)}`
        payment = { note: `${brand} •••• ${card.last4} — expire ${exp}`, cta: 'Modifier', href: '/billing/portal' }
      }
    } catch {
      // Stripe unavailable/misconfigured: fall through to the no-card note.
    }
  }

  return planKey
    ? {
        planLabel: PLAN_LABEL_FR[planKey], price: PLAN_PRICE_FR[planKey], per: '/ an',
        desc: PLAN_DESC_FR[planKey], usageLabel: usage.label, usagePct: usage.pct, payment,
      }
    : {
        planLabel: TRIAL_LABEL, price: TRIAL_PRICE, per: '',
        desc: TRIAL_DESC, usageLabel: usage.label, usagePct: usage.pct, payment,
      }
}
```

- [ ] **Step 5: Full gates + commit**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`

```bash
git add lib/billing/display.ts lib/billing/__tests__/display.test.ts components/exchanges/ExchangesView.tsx app/\(organizer\)/exchanges/page.tsx app/billing/page.tsx actions/settings.ts components/exchanges/__tests__
git commit -m "feat(billing): FR plan display (Essentiel/Association/Réseau, 199/499/799 €) + billing overview

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Team invites — e-mail + owner actions

**Files:**
- Modify: `lib/email.ts`, `actions/settings.ts`
- Test: extend the e-mail tests from Task 3's location

**Interfaces:**
- Consumes: `normalizeEmail`, `isValidEmail` from `@/lib/validation`; `randomToken` from `@/lib/tokens`; `enforceRateLimit`; `createAdminClient`; `getOrganizerCtx`/`assertOwner` (Task 6).
- Produces:
  - `sendOrganizerInviteEmail(opts: { to: string; inviterName: string; schoolName: string; joinUrl: string }): Promise<boolean>`
  - `getTeam(): Promise<{ members: TeamMember[]; pending: PendingInvite[] }>`
  - `inviteOrganizer(rawEmail: string): Promise<void>`, `revokeOrganizerInvite(inviteId: string): Promise<void>`

- [ ] **Step 1: Failing e-mail test**

Add next to the Task-3 e-mail test:

```ts
import { sendOrganizerInviteEmail } from '@/lib/email'

describe('sendOrganizerInviteEmail', () => {
  it('French vouvoiement, escaped names, join link', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    sendMock.mockClear()
    const ok = await sendOrganizerInviteEmail({
      to: 'c@lycee.fr', inviterName: 'Marie <B>', schoolName: 'Lycée <Mistral>',
      joinUrl: 'https://app.test/join/tok123',
    })
    expect(ok).toBe(true)
    const { subject, html } = sendMock.mock.calls[0][0]
    expect(subject).toBe('Marie <B> vous invite sur Eazyexchange')
    expect(html).toContain('Marie &lt;B&gt;')
    expect(html).toContain('Lycée &lt;Mistral&gt;')
    expect(html).toContain('https://app.test/join/tok123')
    expect(html).toContain('valable 14 jours')
  })
})
```

Run: `pnpm test lib/__tests__` → Expected: FAIL.

- [ ] **Step 2: Implement `sendOrganizerInviteEmail` in `lib/email.ts`**

```ts
const ORGANIZER_FOOTER = 'Vous recevez cet e-mail car un collègue vous invite à rejoindre son équipe sur Eazyexchange.'

export async function sendOrganizerInviteEmail(opts: {
  to: string; inviterName: string; schoolName: string; joinUrl: string
}): Promise<boolean> {
  const school = opts.schoolName.trim() ? esc(opts.schoolName) : 'son établissement'
  const html = layout(`
    <p>Bonjour,</p>
    <p><strong>${esc(opts.inviterName)}</strong> vous invite à rejoindre <strong>${school}</strong> sur Eazyexchange pour gérer ensemble les échanges scolaires : élèves, candidatures, formulaires et documents.</p>
    <p><a href="${opts.joinUrl}" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Créer mon compte</a></p>
    <p style="font-size:13px;">Ce lien est valable 14 jours.</p>
  `, ORGANIZER_FOOTER)
  return send(opts.to, `${opts.inviterName} vous invite sur Eazyexchange`, html, 'organizer invite email')
}
```

Run: `pnpm test lib/__tests__` → Expected: PASS.

- [ ] **Step 3: Team actions in `actions/settings.ts`**

Append (add imports: `normalizeEmail`, `isValidEmail` from `@/lib/validation`; `randomToken` from `@/lib/tokens`; `sendOrganizerInviteEmail` from `@/lib/email`):

```ts
export type TeamMember = { id: string; name: string; email: string; isOwner: boolean; isYou: boolean }
export type PendingInvite = { id: string; email: string }

export async function getTeam(): Promise<{ members: TeamMember[]; pending: PendingInvite[] }> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)

  const [{ data: users }, { data: invites }] = await Promise.all([
    supabase.from('users')
      .select('id, full_name, email, org_role')
      .eq('school_id', ctx.schoolId).eq('role', 'organizer')
      .order('created_at'),
    supabase.from('organizer_invites')
      .select('id, email, expires_at')
      .eq('school_id', ctx.schoolId)
      .is('accepted_at', null).is('revoked_at', null)
      .order('created_at'),
  ])

  const now = Date.now()
  return {
    members: (users ?? []).map((u: any) => ({
      id: u.id, name: u.full_name, email: u.email,
      isOwner: u.org_role === 'owner', isYou: u.id === ctx.userId,
    })),
    pending: (invites ?? [])
      .filter((i: any) => new Date(i.expires_at).getTime() > now)
      .map((i: any) => ({ id: i.id, email: i.email })),
  }
}

export async function inviteOrganizer(rawEmail: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  assertOwner(ctx)

  const email = normalizeEmail(rawEmail)
  if (!isValidEmail(email)) throw new Error('Adresse e-mail invalide.')
  await enforceRateLimit(`team-invite:${ctx.schoolId}`, 10, 3600)

  const admin = createAdminClient()
  const { data: existingMember } = await admin
    .from('users').select('id')
    .eq('school_id', ctx.schoolId).eq('email', email).maybeSingle()
  if (existingMember) throw new Error('Cette personne fait déjà partie de votre équipe.')

  const { data: existingInvite } = await admin
    .from('organizer_invites').select('id, expires_at')
    .eq('school_id', ctx.schoolId).eq('email', email)
    .is('accepted_at', null).is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (existingInvite) throw new Error('Une invitation est déjà en attente pour cette adresse.')

  const { data: school } = await admin
    .from('schools').select('name').eq('id', ctx.schoolId).single()

  const token = randomToken()
  const { data: invite, error: insertError } = await admin
    .from('organizer_invites')
    .insert({ school_id: ctx.schoolId, email, token, invited_by: ctx.userId })
    .select('id').single()
  if (insertError || !invite) throw new Error('L’invitation n’a pas pu être créée. Réessayez.')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const ok = await sendOrganizerInviteEmail({
    to: email, inviterName: ctx.fullName, schoolName: school?.name ?? '',
    joinUrl: `${appUrl}/join/${token}`,
  })
  if (!ok) {
    // No orphan pending rows for e-mails that never went out.
    await admin.from('organizer_invites').delete().eq('id', invite.id)
    throw new Error('L’e-mail d’invitation n’a pas pu être envoyé. Réessayez.')
  }
  revalidatePath('/settings')
}

export async function revokeOrganizerInvite(inviteId: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  assertOwner(ctx)

  const admin = createAdminClient()
  const { error } = await admin
    .from('organizer_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId).eq('school_id', ctx.schoolId).is('accepted_at', null)
  if (error) throw new Error('L’invitation n’a pas pu être révoquée.')
  revalidatePath('/settings')
}
```

- [ ] **Step 4: Gates + commit**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`

```bash
git add lib/email.ts lib/__tests__ actions/settings.ts
git commit -m "feat(team): organizer invite email + getTeam/inviteOrganizer/revoke actions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: `/join/[token]` — invite acceptance

**Files:**
- Create: `lib/team/invite-state.ts`, `actions/join.ts`, `app/join/[token]/page.tsx`, `components/auth/JoinForm.tsx`
- Modify: `middleware.ts`
- Test: `lib/team/__tests__/invite-state.test.ts`, `components/auth/__tests__/JoinForm.test.tsx`

**Interfaces:**
- Consumes: `createAdminClient`; `enforceRateLimit`, `clientIp` from `@/lib/rate-limit`; `isPasswordPwned`, `passwordPolicyError`, `PWNED_MESSAGE` from `@/lib/auth/hibp`; browser `createClient` from `@/lib/supabase/client` (sign-in after acceptance).
- Produces:
  - `type JoinInfo = { state: 'ok'; schoolName: string; email: string } | { state: 'invalid' | 'expired' | 'revoked' | 'accepted' }`
  - `getJoinInvite(token: string): Promise<JoinInfo>`
  - `acceptOrganizerInvite(token: string, fullName: string, password: string): Promise<{ email: string }>`
- Flow: server page resolves the token → `JoinForm` collects name + password → action creates the confirmed auth user + `users` row (`role='organizer'`, `org_role='admin'`) → the CLIENT signs in with `signInWithPassword` and pushes `/dashboard`. Google sign-in works afterwards because the profile exists (the `/auth/callback` invite-only check passes).

- [ ] **Step 1: `middleware.ts` — make `/join` public**

In the `isPublicRoute` expression add:

```ts
pathname.startsWith('/join') ||
```

- [ ] **Step 2: Pure invite-state helper (failing test first)**

Create `lib/team/__tests__/invite-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { inviteState } from '@/lib/team/invite-state'

const now = new Date('2026-07-04T12:00:00Z')
const base = { expires_at: '2026-07-18T12:00:00Z', accepted_at: null, revoked_at: null }

describe('inviteState', () => {
  it('missing row → invalid', () => expect(inviteState(null, now)).toBe('invalid'))
  it('revoked wins over everything', () =>
    expect(inviteState({ ...base, revoked_at: '2026-07-03T00:00:00Z', accepted_at: '2026-07-02T00:00:00Z' }, now)).toBe('revoked'))
  it('accepted → accepted', () =>
    expect(inviteState({ ...base, accepted_at: '2026-07-03T00:00:00Z' }, now)).toBe('accepted'))
  it('past expiry → expired', () =>
    expect(inviteState({ ...base, expires_at: '2026-07-04T11:59:59Z' }, now)).toBe('expired'))
  it('live → ok', () => expect(inviteState(base, now)).toBe('ok'))
})
```

Run: `pnpm test lib/team` → Expected: FAIL. Then create `lib/team/invite-state.ts`:

```ts
// Single-use organizer-invite token lifecycle. Order matters: an explicit
// revocation beats acceptance beats expiry.
export type InviteState = 'ok' | 'invalid' | 'expired' | 'revoked' | 'accepted'

export function inviteState(
  row: { expires_at: string; accepted_at: string | null; revoked_at: string | null } | null,
  now: Date = new Date(),
): InviteState {
  if (!row) return 'invalid'
  if (row.revoked_at) return 'revoked'
  if (row.accepted_at) return 'accepted'
  if (new Date(row.expires_at).getTime() < now.getTime()) return 'expired'
  return 'ok'
}
```

Run: `pnpm test lib/team` → Expected: PASS.

- [ ] **Step 3: Create `actions/join.ts`**

```ts
'use server'
// Public (unauthenticated) organizer-invite acceptance. Service-role only —
// mirrors the anonymous application flow's token-keyed pattern.
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, clientIp } from '@/lib/rate-limit'
import { isPasswordPwned, passwordPolicyError, PWNED_MESSAGE } from '@/lib/auth/hibp'
import { inviteState, type InviteState } from '@/lib/team/invite-state'

export type JoinInfo =
  | { state: 'ok'; schoolName: string; email: string }
  | { state: Exclude<InviteState, 'ok'> }

type InviteRow = {
  id: string; school_id: string; email: string
  expires_at: string; accepted_at: string | null; revoked_at: string | null
  schools: { name: string } | null
}

async function lookupInvite(token: string): Promise<{ state: InviteState; row?: InviteRow }> {
  if (!token) return { state: 'invalid' }
  const admin = createAdminClient()
  const { data } = await admin
    .from('organizer_invites')
    .select('id, school_id, email, expires_at, accepted_at, revoked_at, schools(name)')
    .eq('token', token)
    .maybeSingle()
  const row = data as InviteRow | null
  const state = inviteState(row)
  return state === 'ok' && row ? { state, row } : { state }
}

export async function getJoinInvite(token: string): Promise<JoinInfo> {
  const { state, row } = await lookupInvite(token)
  if (state !== 'ok' || !row) return { state } as JoinInfo
  return { state: 'ok', schoolName: row.schools?.name ?? '', email: row.email }
}

const JOIN_STATE_MESSAGES: Record<Exclude<JoinInfo['state'], 'ok'>, string> = {
  invalid: 'Ce lien d’invitation est invalide.',
  expired: 'Ce lien d’invitation a expiré — demandez à votre collègue de renvoyer une invitation.',
  revoked: 'Cette invitation a été révoquée.',
  accepted: 'Cette invitation a déjà été utilisée. Connectez-vous.',
}

export async function acceptOrganizerInvite(
  token: string, fullName: string, password: string,
): Promise<{ email: string }> {
  await enforceRateLimit(`join:${await clientIp()}`, 10, 3600)

  const { state, row } = await lookupInvite(token)
  if (state !== 'ok' || !row) throw new Error(JOIN_STATE_MESSAGES[state as Exclude<JoinInfo['state'], 'ok'>])

  const name = fullName.trim()
  if (!name) throw new Error('Indiquez votre nom complet.')
  const policyError = passwordPolicyError(password)
  if (policyError) throw new Error(policyError)
  if (await isPasswordPwned(password)) throw new Error(PWNED_MESSAGE)

  const admin = createAdminClient()

  // Claim the token first (single-use): losing a race means the other request won.
  const { data: claimed } = await admin
    .from('organizer_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', row.id).is('accepted_at', null)
    .select('id')
  if (!claimed || claimed.length === 0) throw new Error(JOIN_STATE_MESSAGES.accepted)

  // Link possession proves e-mail ownership → create the user pre-confirmed.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: row.email, password, email_confirm: true,
  })
  if (createError || !created?.user) {
    await admin.from('organizer_invites').update({ accepted_at: null }).eq('id', row.id)
    throw new Error(
      createError?.code === 'email_exists'
        ? 'Un compte existe déjà avec cette adresse. Connectez-vous.'
        : 'Le compte n’a pas pu être créé. Réessayez.',
    )
  }

  const { error: profileError } = await admin.from('users').insert({
    id: created.user.id,
    school_id: row.school_id,
    role: 'organizer',
    org_role: 'admin',
    full_name: name,
    email: row.email,
  })
  if (profileError) {
    // No orphan auth rows (same rollback as provisionOrganizer).
    await admin.auth.admin.deleteUser(created.user.id)
    await admin.from('organizer_invites').update({ accepted_at: null }).eq('id', row.id)
    throw new Error('Le compte n’a pas pu être créé. Réessayez.')
  }

  return { email: row.email }
}
```

- [ ] **Step 4: Create `app/join/[token]/page.tsx`**

```tsx
import { getJoinInvite } from '@/actions/join'
import { Logo } from '@/components/brand/Logo'
import { JoinForm } from '@/components/auth/JoinForm'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const STATE_COPY: Record<string, string> = {
  invalid: 'Ce lien d’invitation est invalide.',
  expired: 'Ce lien d’invitation a expiré — demandez à votre collègue de renvoyer une invitation.',
  revoked: 'Cette invitation a été révoquée.',
  accepted: 'Cette invitation a déjà été utilisée.',
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const info = await getJoinInvite(token)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <Logo />
      {info.state === 'ok' ? (
        <JoinForm token={token} email={info.email} schoolName={info.schoolName} />
      ) : (
        <div className="w-full max-w-sm rounded-2xl border bg-card p-7 text-center">
          <p className="text-sm text-muted-foreground">{STATE_COPY[info.state]}</p>
          <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-brand hover:underline">
            Se connecter
          </Link>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Write the failing `JoinForm` tests**

Create `components/auth/__tests__/JoinForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const accept = vi.fn().mockResolvedValue({ email: 'c@lycee.fr' })
vi.mock('@/actions/join', () => ({ acceptOrganizerInvite: (...a: unknown[]) => accept(...a) }))
const signIn = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithPassword: (...a: unknown[]) => signIn(...a) } }),
}))
import { JoinForm } from '@/components/auth/JoinForm'

function fill(pw: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('Nom complet'), { target: { value: 'Claire Nguyen' } })
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: pw } })
  fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: confirm } })
}

describe('JoinForm', () => {
  beforeEach(() => { accept.mockClear(); signIn.mockClear(); push.mockClear() })

  it('shows school + email context', () => {
    render(<JoinForm token="tok" email="c@lycee.fr" schoolName="Lycée Mistral" />)
    expect(screen.getByText(/Lycée Mistral/)).toBeInTheDocument()
    expect(screen.getByText('c@lycee.fr')).toBeInTheDocument()
  })

  it('rejects mismatched passwords without calling the action', async () => {
    render(<JoinForm token="tok" email="c@lycee.fr" schoolName="Lycée Mistral" />)
    fill('longenough', 'different')
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))
    expect(await screen.findByText('Les mots de passe ne correspondent pas.')).toBeInTheDocument()
    expect(accept).not.toHaveBeenCalled()
  })

  it('accepts, signs in, and redirects to /dashboard', async () => {
    render(<JoinForm token="tok" email="c@lycee.fr" schoolName="Lycée Mistral" />)
    fill('longenough', 'longenough')
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
    expect(accept).toHaveBeenCalledWith('tok', 'Claire Nguyen', 'longenough')
    expect(signIn).toHaveBeenCalledWith({ email: 'c@lycee.fr', password: 'longenough' })
  })

  it('surfaces action errors inline', async () => {
    accept.mockRejectedValueOnce(new Error('Cette invitation a été révoquée.'))
    render(<JoinForm token="tok" email="c@lycee.fr" schoolName="Lycée Mistral" />)
    fill('longenough', 'longenough')
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))
    expect(await screen.findByText('Cette invitation a été révoquée.')).toBeInTheDocument()
  })
})
```

Run: `pnpm test components/auth` → Expected: FAIL (module not found).

- [ ] **Step 6: Implement `components/auth/JoinForm.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { acceptOrganizerInvite } from '@/actions/join'

export function JoinForm({ token, email, schoolName }: { token: string; email: string; schoolName: string }) {
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return }
    setBusy(true)
    try {
      await acceptOrganizerInvite(token, fullName, password)
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) { setError('Compte créé — connectez-vous avec votre nouveau mot de passe.'); setBusy(false); return }
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
      setBusy(false)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border bg-card p-7">
      <h1 className="font-display text-xl font-bold tracking-tight text-navy">Rejoindre l’équipe</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Vous êtes invité·e à rejoindre <span className="font-semibold text-foreground">{schoolName || 'un établissement'}</span> sur
        Eazyexchange, avec l’adresse <span className="font-medium text-foreground">{email}</span>.
      </p>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="space-y-1">
          <label htmlFor="join-name" className="text-xs font-semibold text-foreground">Nom complet</label>
          <input id="join-name" value={fullName} onChange={e => setFullName(e.target.value)} required
            className="h-10 w-full rounded-[9px] border px-3 text-[13.5px] focus:border-brand focus:outline-none" />
        </div>
        <div className="space-y-1">
          <label htmlFor="join-pw" className="text-xs font-semibold text-foreground">Mot de passe</label>
          <input id="join-pw" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
            className="h-10 w-full rounded-[9px] border px-3 text-[13.5px] focus:border-brand focus:outline-none" />
        </div>
        <div className="space-y-1">
          <label htmlFor="join-cf" className="text-xs font-semibold text-foreground">Confirmer le mot de passe</label>
          <input id="join-cf" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8}
            className="h-10 w-full rounded-[9px] border px-3 text-[13.5px] focus:border-brand focus:outline-none" />
        </div>
        {error && <p className="text-sm text-danger-text">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full rounded-[9px] bg-brand py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50">
          {busy ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 7: Run tests, gates, commit**

Run: `pnpm test lib/team components/auth` → Expected: PASS.
Run: `pnpm lint && pnpm test && npx tsc --noEmit`

```bash
git add lib/team actions/join.ts app/join components/auth/JoinForm.tsx components/auth/__tests__/JoinForm.test.tsx middleware.ts
git commit -m "feat(team): /join/[token] organizer invite acceptance

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Exchange archiving — guard, actions, wiring, cron

**Files:**
- Create: `lib/exchange-guard.ts`
- Modify: `actions/settings.ts`, `actions/exchanges.ts`, `actions/forms.ts`, `actions/students.ts`, `actions/applications.ts`, `actions/submissions.ts`, `supabase/functions/send-reminders/index.ts`
- Test: `lib/__tests__/exchange-guard.test.ts`

**Interfaces:**
- Consumes: `getOrganizerCtx`/`assertOwner` (Task 6).
- Produces:
  - `ARCHIVED_ERROR = 'Programme archivé — lecture seule.'`
  - `assertExchangeWritable(supabase: SupabaseClient, exchangeId: string): Promise<void>`
  - `getProgramInfo(exchangeId: string): Promise<ProgramInfo>`, `archiveExchange(exchangeId: string): Promise<void>`, `restoreExchange(exchangeId: string): Promise<void>` in `actions/settings.ts`

- [ ] **Step 1: Failing guard test**

Create `lib/__tests__/exchange-guard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { assertExchangeWritable, ARCHIVED_ERROR } from '@/lib/exchange-guard'
import type { SupabaseClient } from '@supabase/supabase-js'

const fake = (archived_at: string | null) => ({
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { archived_at } }) }),
    }),
  }),
}) as unknown as SupabaseClient

describe('assertExchangeWritable', () => {
  it('passes for a live exchange', async () => {
    await expect(assertExchangeWritable(fake(null), 'ex1')).resolves.toBeUndefined()
  })
  it('throws the French read-only error for an archived exchange', async () => {
    await expect(assertExchangeWritable(fake('2026-07-04T08:00:00Z'), 'ex1'))
      .rejects.toThrow(ARCHIVED_ERROR)
  })
})
```

Run: `pnpm test lib/__tests__/exchange-guard` → Expected: FAIL.

- [ ] **Step 2: Implement `lib/exchange-guard.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export const ARCHIVED_ERROR = 'Programme archivé — lecture seule.'

// Server-side write gate for exchange-scoped mutations. Reads stay open —
// archived dossiers remain consultable everywhere. Works with both the
// session client (RLS row visibility applies) and the admin client.
export async function assertExchangeWritable(
  supabase: SupabaseClient, exchangeId: string,
): Promise<void> {
  const { data } = await supabase
    .from('exchanges').select('archived_at').eq('id', exchangeId).maybeSingle()
  if (data?.archived_at) throw new Error(ARCHIVED_ERROR)
}
```

Run: `pnpm test lib/__tests__/exchange-guard` → Expected: PASS.

- [ ] **Step 3: Program info + archive/restore in `actions/settings.ts`**

Append (import `assertExchangeWritable` is NOT needed here — archive/restore themselves must work on archived exchanges):

```ts
export type ProgramInfo = {
  id: string; name: string; year: number; phase: 1 | 2; archived: boolean
  enrolled: number; applications: number; earliestDeadline: string | null
}

// Scope check: the exchange must belong to the caller's school (either side).
async function getScopedExchange(supabase: SupabaseClient, schoolId: string, exchangeId: string) {
  const { data: exchange } = await supabase
    .from('exchanges')
    .select('id, name, year, phase, archived_at, school_a_id, school_b_id')
    .eq('id', exchangeId).maybeSingle()
  if (!exchange || (exchange.school_a_id !== schoolId && exchange.school_b_id !== schoolId)) {
    throw new Error('Unauthorized')
  }
  return exchange
}

export async function getProgramInfo(exchangeId: string): Promise<ProgramInfo> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  assertOwner(ctx)
  const exchange = await getScopedExchange(supabase, ctx.schoolId, exchangeId)

  const [{ count: enrolled }, { count: applications }, { data: firstDeadline }] = await Promise.all([
    supabase.from('exchange_enrollments')
      .select('id', { count: 'exact', head: true }).eq('exchange_id', exchangeId),
    supabase.from('applications')
      .select('id', { count: 'exact', head: true }).eq('exchange_id', exchangeId),
    supabase.from('form_templates')
      .select('deadline').eq('exchange_id', exchangeId).eq('school_id', ctx.schoolId)
      .eq('status', 'active').not('deadline', 'is', null)
      .order('deadline', { ascending: true }).limit(1).maybeSingle(),
  ])

  return {
    id: exchange.id, name: exchange.name, year: exchange.year,
    phase: (exchange.phase ?? 1) as 1 | 2, archived: !!exchange.archived_at,
    enrolled: enrolled ?? 0, applications: applications ?? 0,
    earliestDeadline: (firstDeadline?.deadline as string | null) ?? null,
  }
}

export async function archiveExchange(exchangeId: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  assertOwner(ctx)
  await getScopedExchange(supabase, ctx.schoolId, exchangeId)
  const { error } = await supabase.from('exchanges')
    .update({ archived_at: new Date().toISOString() }).eq('id', exchangeId)
  if (error) throw new Error('Le programme n’a pas pu être archivé. Réessayez.')
  revalidatePath('/settings'); revalidatePath('/dashboard')
}

export async function restoreExchange(exchangeId: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  assertOwner(ctx)
  await getScopedExchange(supabase, ctx.schoolId, exchangeId)
  const { error } = await supabase.from('exchanges')
    .update({ archived_at: null }).eq('id', exchangeId)
  if (error) throw new Error('Le programme n’a pas pu être restauré. Réessayez.')
  revalidatePath('/settings'); revalidatePath('/dashboard')
}
```

- [ ] **Step 4: Wire the guard into every exchange-scoped mutating action**

Import `assertExchangeWritable` from `@/lib/exchange-guard` in each file. Insert the call **after** the existing auth/scope check and **before** the first write. Exact call sites:

**`actions/exchanges.ts`** — both actions already resolve the exchange row:
- `setApplicationOpen` → `await assertExchangeWritable(supabase, exchangeId)`
- `setExchangePhase` → same.

**`actions/forms.ts`** — the template-based write actions get the exchange id from `getOwnedTemplate` (it already selects `exchange_id`):
- `updateTemplateMeta`, `replaceTemplateFile`, `activateTemplate`, `deleteTemplate`, `remindTemplate`: after `const tmpl = await getOwnedTemplate(...)` add `await assertExchangeWritable(supabase, tmpl.exchange_id)`.
- `createDraftTemplate`: after `assertOrganizer` add `await assertExchangeWritable(supabase, exchangeId)` (uses the `exchange_id` form value it already reads).
- `addField` / `removeField` use `assertOrganizerOwnsTemplate`, which doesn't expose the exchange. Change it to return the exchange id:

```ts
async function assertOrganizerOwnsTemplate(
  supabase: SupabaseClient, userId: string, templateId: string,
): Promise<{ exchangeId: string }> {
  const schoolId = await assertOrganizer(supabase, userId)
  const { data: tmpl } = await supabase
    .from('form_templates').select('school_id, exchange_id').eq('id', templateId).maybeSingle()
  if (!tmpl || tmpl.school_id !== schoolId) throw new Error('Unauthorized')
  return { exchangeId: tmpl.exchange_id as string }
}
```

  Then in `addField` and `removeField`: `const { exchangeId } = await assertOrganizerOwnsTemplate(...); await assertExchangeWritable(supabase, exchangeId)`. `getTemplate` (read) keeps calling it but ignores the return value — no guard.

**`actions/students.ts`**:
- `remindStudent`: after `assertOrganizerInExchange` add `await assertExchangeWritable(supabase, exchangeId)`.

**`actions/applications.ts`** — read each function first; every one below already fetches (or can trivially select) the application's/exchange's `exchange_id`:
- `startApplication` and `submitApplication` (public token flows, admin client): guard with the admin client and the exchange id they already resolve — an archived program accepts no new/updated applications.
- `acceptApplication`, `rejectApplication`: these fetch the application row — ensure the select includes `exchange_id`, then guard. Verify `acceptApplications`/`rejectApplications` (plural) delegate to the singular functions; if they carry their own write path, guard there too.
- `respondToInvitation`: guard after the invite-token lookup (it resolves the application → include `exchange_id`).
- `saveApplicationDraft`, `uploadApplicationPhoto`: guard as well (they mutate application state) — same pattern, resolve `exchange_id` from the application row already being fetched.
- `sendApplicationResumeLink`: leave unguarded (sends mail, mutates nothing material) — judgment call, note it in the ledger.

**`actions/submissions.ts`** — the student/organizer write actions all resolve the assignment → template chain already; extend that select with `form_templates(exchange_id)` (or add `exchange_id` where the template is already joined) and guard:
- `saveFormAnswers`, `recordDocumentUpload`, `submitDocumentAssignment`, `approveSubmission`, `rejectSubmission`.

Use `ARCHIVED_ERROR` as the thrown message everywhere (it already is, via the shared helper).

- [ ] **Step 5: Cron skips archived exchanges**

In `supabase/functions/send-reminders/index.ts`, change the select to pull the exchange's archived flag through the template join:

```ts
.select(
  'id, last_reminded_at, student:users!student_id(email, full_name), form_templates!inner(name, deadline, exchanges!inner(archived_at)), submissions(status)',
)
```

and add the skip right after the submission-status check inside the loop:

```ts
if (row.form_templates?.exchanges?.archived_at) continue
```

- [ ] **Step 6: Gates + commit**

Run: `pnpm lint && pnpm test && npx tsc --noEmit` → all green (existing action tests, if any, must still pass — the guard only adds a read).

```bash
git add lib/exchange-guard.ts lib/__tests__/exchange-guard.test.ts actions/settings.ts actions/exchanges.ts actions/forms.ts actions/students.ts actions/applications.ts actions/submissions.ts supabase/functions/send-reminders/index.ts
git commit -m "feat(archive): exchanges.archived_at write guard across all mutating actions + cron skip

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: `/settings` page — SettingsView shell + Compte section

**Files:**
- Create: `app/(organizer)/settings/page.tsx`, `components/settings/SettingsView.tsx`, `components/settings/ProfileCard.tsx`, `components/settings/SecurityCard.tsx`
- Test: `components/settings/__tests__/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `updateProfile`, `changePassword`, `getTeam`, `getBillingOverview`, `getProgramInfo` + their types (Tasks 6–8, 10); `getExchanges`, `resolveActiveExchange`.
- Produces: `SettingsView` props contract used by Task 12's cards:

```ts
export type SettingsProps = {
  profile: { fullName: string; email: string; phone: string; title: string; schoolName: string }
  isOwner: boolean
  canChangePassword: boolean
  team: { members: TeamMember[]; pending: PendingInvite[] }
  billing: BillingOverview | null   // null for admins
  program: ProgramInfo | null       // null for admins or when no exchange exists
}
```

To keep every commit shippable, this task renders only the two Compte cards plus the section nav; the Équipe/Facturation/Programme nav entries and cards land in Task 12. The nav array in this task therefore contains only « Compte personnel » — Task 12 extends it.

- [ ] **Step 1: Failing tests**

Create `components/settings/__tests__/SettingsView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const updateProfile = vi.fn().mockResolvedValue(undefined)
const changePassword = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/settings', () => ({
  updateProfile: (...a: unknown[]) => updateProfile(...a),
  changePassword: (...a: unknown[]) => changePassword(...a),
  inviteOrganizer: vi.fn(), revokeOrganizerInvite: vi.fn(),
  archiveExchange: vi.fn(), restoreExchange: vi.fn(),
}))
import { SettingsView } from '@/components/settings/SettingsView'

const baseProps = {
  profile: {
    fullName: 'Marie Blanchet', email: 'm.blanchet@lycee-mistral.fr',
    phone: '06 12 45 78 90', title: 'Coordinatrice des échanges', schoolName: 'Lycée Frédéric Mistral',
  },
  isOwner: false,
  canChangePassword: true,
  team: { members: [], pending: [] },
  billing: null,
  program: null,
}

describe('SettingsView — Compte', () => {
  beforeEach(() => { updateProfile.mockClear(); changePassword.mockClear() })

  it('renders H1, subline and the profile fields', () => {
    render(<SettingsView {...baseProps} />)
    expect(screen.getByRole('heading', { name: 'Réglages' })).toBeInTheDocument()
    expect(screen.getByText('Votre compte, votre équipe et votre abonnement.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nom complet')).toHaveValue('Marie Blanchet')
    expect(screen.getByLabelText('Adresse e-mail')).toBeDisabled()
    expect(screen.getByLabelText('Fonction')).toHaveValue('Coordinatrice des échanges')
    expect(screen.getByLabelText('Établissement')).toHaveValue('Lycée Frédéric Mistral')
  })

  it('saves the profile and flashes confirmation', async () => {
    render(<SettingsView {...baseProps} />)
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '06 00 00 00 00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('✓ Modifications enregistrées')).toBeInTheDocument()
    expect(updateProfile).toHaveBeenCalledWith({
      fullName: 'Marie Blanchet', phone: '06 00 00 00 00',
      title: 'Coordinatrice des échanges', schoolName: 'Lycée Frédéric Mistral',
    })
  })

  it('password panel: mismatch is caught client-side', async () => {
    render(<SettingsView {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }))
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'oldpassword' } })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'newpassword' } })
    fireEvent.change(screen.getByLabelText('Confirmer'), { target: { value: 'other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour le mot de passe' }))
    expect(await screen.findByText('Les mots de passe ne correspondent pas.')).toBeInTheDocument()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('password panel: happy path calls the action and closes', async () => {
    render(<SettingsView {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }))
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'oldpassword' } })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'newpassword' } })
    fireEvent.change(screen.getByLabelText('Confirmer'), { target: { value: 'newpassword' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour le mot de passe' }))
    expect(await screen.findByText('✓ Mot de passe mis à jour')).toBeInTheDocument()
    expect(changePassword).toHaveBeenCalledWith('oldpassword', 'newpassword')
  })

  it('Google-only account: no password button, explanatory note instead', () => {
    render(<SettingsView {...baseProps} canChangePassword={false} />)
    expect(screen.queryByRole('button', { name: 'Modifier le mot de passe' })).toBeNull()
    expect(screen.getByText('Connexion via Google — la gestion du mot de passe ne s’applique pas à votre compte.')).toBeInTheDocument()
  })
})
```

Run: `pnpm test components/settings` → Expected: FAIL.

- [ ] **Step 2: Implement `components/settings/SettingsView.tsx`**

```tsx
'use client'
import { useState } from 'react'
import type { TeamMember, PendingInvite, BillingOverview, ProgramInfo } from '@/actions/settings'
import { ProfileCard } from './ProfileCard'
import { SecurityCard } from './SecurityCard'

export type SettingsProps = {
  profile: { fullName: string; email: string; phone: string; title: string; schoolName: string }
  isOwner: boolean
  canChangePassword: boolean
  team: { members: TeamMember[]; pending: PendingInvite[] }
  billing: BillingOverview | null
  program: ProgramInfo | null
}

type SectionKey = 'compte' // Task 12 widens this to 'compte' | 'equipe' | 'fact' | 'prog'

export function SettingsView(props: SettingsProps) {
  const [section, setSection] = useState<SectionKey>('compte')
  const sections: { key: SectionKey; label: string }[] = [
    { key: 'compte', label: 'Compte personnel' },
  ]

  return (
    <div className="max-w-[1120px]">
      <div className="mb-5">
        <h1 className="mb-1 font-display text-[25px] font-bold leading-[1.1] tracking-[-.02em]">Réglages</h1>
        <p className="text-[13px] text-muted-foreground">Votre compte, votre équipe et votre abonnement.</p>
      </div>
      <div className="flex items-start gap-[26px]">
        <div className="flex w-[222px] flex-none flex-col gap-1">
          {sections.map(s => (
            <button
              key={s.key} type="button" onClick={() => setSection(s.key)}
              className={`flex items-center rounded-[11px] px-3.5 py-2.5 text-left text-[13.5px] ${
                section === s.key
                  ? 'border bg-card font-semibold text-foreground shadow-float'
                  : 'border border-transparent font-medium text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
          {section === 'compte' && (
            <>
              <ProfileCard profile={props.profile} />
              <SecurityCard canChangePassword={props.canChangePassword} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Implement `components/settings/ProfileCard.tsx`**

```tsx
'use client'
import { useRef, useState } from 'react'
import { updateProfile } from '@/actions/settings'

const AVATAR_GRADIENT = 'linear-gradient(135deg,#3B6EF6,#0E1B38)' // handoff constant

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
}

export function ProfileCard({ profile }: {
  profile: { fullName: string; email: string; phone: string; title: string; schoolName: string }
}) {
  const [f, setF] = useState({
    fullName: profile.fullName, phone: profile.phone,
    title: profile.title, schoolName: profile.schoolName,
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  async function handleSave() {
    setBusy(true); setError(null)
    try {
      await updateProfile(f)
      setSaved(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setSaved(false), 2200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setBusy(false)
  }

  const fields: { key: keyof typeof f | 'email'; label: string; disabled?: boolean; hint?: string }[] = [
    { key: 'fullName', label: 'Nom complet' },
    { key: 'email', label: 'Adresse e-mail', disabled: true, hint: 'Contactez le support pour changer d’adresse.' },
    { key: 'phone', label: 'Téléphone' },
    { key: 'title', label: 'Fonction' },
    { key: 'schoolName', label: 'Établissement' },
  ]

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-[22px] flex items-center gap-[15px]">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
          style={{ background: AVATAR_GRADIENT }}
        >
          {initialsOf(f.fullName || profile.fullName)}
        </span>
        <div>
          <div className="font-display text-[17px] font-bold tracking-[-.01em] text-foreground">{f.fullName}</div>
          <div className="mt-0.5 text-[13px] text-tertiary">
            {[f.title, f.schoolName].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-[15px] sm:grid-cols-2">
        {fields.map(fl => (
          <div key={fl.key}>
            <label htmlFor={`pf-${fl.key}`} className="mb-1.5 block text-xs font-semibold text-foreground">{fl.label}</label>
            <input
              id={`pf-${fl.key}`}
              value={fl.key === 'email' ? profile.email : f[fl.key as keyof typeof f]}
              disabled={fl.disabled}
              onChange={e => setF({ ...f, [fl.key]: e.target.value })}
              className="h-10 w-full rounded-[9px] border px-3 text-[13.5px] focus:border-brand focus:outline-none disabled:bg-hoverrow disabled:text-muted-foreground"
            />
            {fl.hint && <p className="mt-1 text-[11px] text-placeholder">{fl.hint}</p>}
          </div>
        ))}
      </div>
      <div className="mt-[22px] flex items-center justify-end gap-3.5">
        {error && <span className="text-[12.5px] font-medium text-danger-text">{error}</span>}
        {saved && <span className="text-[12.5px] font-medium text-success-text">✓ Modifications enregistrées</span>}
        <button
          type="button" onClick={handleSave} disabled={busy}
          className="rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          Enregistrer
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement `components/settings/SecurityCard.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { changePassword } from '@/actions/settings'

export function SecurityCard({ canChangePassword }: { canChangePassword: boolean }) {
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [cf, setCf] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSave() {
    setError(null); setDone(false)
    if (nw !== cf) { setError('Les mots de passe ne correspondent pas.'); return }
    setBusy(true)
    try {
      await changePassword(cur, nw)
      setDone(true); setOpen(false); setCur(''); setNw(''); setCf('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setBusy(false)
  }

  const pwFields = [
    { key: 'cur', label: 'Mot de passe actuel', value: cur, set: setCur },
    { key: 'nw', label: 'Nouveau mot de passe', value: nw, set: setNw },
    { key: 'cf', label: 'Confirmer', value: cf, set: setCf },
  ]

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-4 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">Sécurité</div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[13.5px] font-semibold text-foreground">Mot de passe</div>
          {!canChangePassword && (
            <div className="mt-0.5 text-[12.5px] text-tertiary">
              Connexion via Google — la gestion du mot de passe ne s’applique pas à votre compte.
            </div>
          )}
          {canChangePassword && done && (
            <div className="mt-0.5 text-[12.5px] font-medium text-success-text">✓ Mot de passe mis à jour</div>
          )}
        </div>
        {canChangePassword && (
          <button
            type="button" onClick={() => { setOpen(o => !o); setError(null) }}
            className="rounded-[9px] border px-3.5 py-2 text-[12.5px] font-semibold text-foreground hover:bg-hoverrow"
          >
            {open ? 'Annuler' : 'Modifier le mot de passe'}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3.5 rounded-xl bg-hoverrow p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {pwFields.map(pf => (
              <div key={pf.key}>
                <label htmlFor={`pw-${pf.key}`} className="mb-1.5 block text-xs font-semibold text-foreground">{pf.label}</label>
                <input
                  id={`pw-${pf.key}`} type="password" value={pf.value}
                  onChange={e => pf.set(e.target.value)}
                  className="h-[38px] w-full rounded-[9px] border bg-card px-3 text-[13.5px] focus:border-brand focus:outline-none"
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-3">
            {error && <span className="text-[12.5px] font-medium text-danger-text">{error}</span>}
            <button
              type="button" onClick={handleSave} disabled={busy}
              className="rounded-[9px] bg-brand px-[15px] py-[9px] text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
            >
              Mettre à jour le mot de passe
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Implement `app/(organizer)/settings/page.tsx`**

```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getExchanges } from '@/actions/exchanges'
import {
  getTeam, getBillingOverview, getProgramInfo,
  type BillingOverview, type ProgramInfo,
} from '@/actions/settings'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { SettingsView } from '@/components/settings/SettingsView'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, email, phone, title, org_role, schools(name)')
    .eq('id', user.id)
    .single<{ full_name: string; email: string; phone: string | null; title: string | null; org_role: string; schools: { name: string } | null }>()
  if (!profile) redirect('/login')

  const isOwner = profile.org_role === 'owner'
  const canChangePassword = (user.identities ?? []).some(i => i.provider === 'email')
  const team = await getTeam()

  let billing: BillingOverview | null = null
  let program: ProgramInfo | null = null
  if (isOwner) {
    billing = await getBillingOverview()
    const exchanges = await getExchanges()
    const cookieStore = await cookies()
    const active = resolveActiveExchange(
      exchanges.map((e: any) => ({ ...e, archived: !!e.archived_at })),
      cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value,
    )
    if (active) program = await getProgramInfo(active.id)
  }

  return (
    <SettingsView
      profile={{
        fullName: profile.full_name, email: profile.email,
        phone: profile.phone ?? '', title: profile.title ?? '',
        schoolName: profile.schools?.name ?? '',
      }}
      isOwner={isOwner}
      canChangePassword={canChangePassword}
      team={team}
      billing={billing}
      program={program}
    />
  )
}
```

- [ ] **Step 6: Run tests, gates, commit**

Run: `pnpm test components/settings` → Expected: PASS.
Run: `pnpm lint && pnpm test && npx tsc --noEmit`

```bash
git add app/\(organizer\)/settings components/settings
git commit -m "feat(settings): /settings page — section nav + Compte (profil, sécurité)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Réglages — Équipe, Facturation, Programme sections

**Files:**
- Create: `components/settings/TeamCard.tsx`, `components/settings/BillingCard.tsx`, `components/settings/ProgramCard.tsx`
- Modify: `components/settings/SettingsView.tsx`
- Test: extend `components/settings/__tests__/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `inviteOrganizer`, `revokeOrganizerInvite`, `archiveExchange`, `restoreExchange` + `TeamMember`, `PendingInvite`, `BillingOverview`, `ProgramInfo` types; `frShortDate` from `@/lib/dashboard/rollup`; `StatusPill`.
- Produces: complete Réglages page. Section visibility: `equipe` always; `fact`/`prog` only when `isOwner` (and `prog` only when `program !== null`).

- [ ] **Step 1: Failing tests (extend the Task-11 file)**

```tsx
const owner = {
  ...baseProps,
  isOwner: true,
  team: {
    members: [
      { id: 'u1', name: 'Marie Blanchet', email: 'm.blanchet@lycee-mistral.fr', isOwner: true, isYou: true },
      { id: 'u2', name: 'Antoine Dubois', email: 'a.dubois@lycee-mistral.fr', isOwner: false, isYou: false },
    ],
    pending: [{ id: 'i1', email: 'j.moreau@lycee-mistral.fr' }],
  },
  billing: {
    planLabel: 'Essai gratuit', price: '0 €', per: '', desc: 'Votre premier échange est offert — aucun paiement requis.',
    usageLabel: '1 / 1 échange utilisé', usagePct: 100,
    payment: { note: 'Aucun moyen de paiement enregistré.', cta: 'Ajouter une carte', href: '/billing' },
  },
  program: {
    id: 'ex1', name: 'Programme Espagne', year: 2026, phase: 2 as const, archived: false,
    enrolled: 10, applications: 12, earliestDeadline: '2026-10-10',
  },
}

describe('SettingsView — owner sections', () => {
  it('admin sees only Compte + Équipe in the nav', () => {
    render(<SettingsView {...baseProps} />)
    expect(screen.getByRole('button', { name: 'Compte personnel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Équipe & rôles' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Facturation' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Programme' })).toBeNull()
  })

  it('team: members, VOUS + Propriétaire pills, pending invite with revoke (owner only)', async () => {
    const { inviteOrganizer, revokeOrganizerInvite } = await import('@/actions/settings')
    render(<SettingsView {...owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'Équipe & rôles' }))
    expect(screen.getByText('VOUS')).toBeInTheDocument()
    expect(screen.getByText('Propriétaire')).toBeInTheDocument()
    expect(screen.getByText('Antoine Dubois')).toBeInTheDocument()
    expect(screen.getByText('Invitation envoyée')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Révoquer' }))
    expect(revokeOrganizerInvite).toHaveBeenCalledWith('i1')
    fireEvent.change(screen.getByPlaceholderText('adresse@etablissement.fr'), { target: { value: 'x@lycee.fr' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inviter' }))
    expect(inviteOrganizer).toHaveBeenCalledWith('x@lycee.fr')
  })

  it('team as admin: list visible, no invite row, no revoke', () => {
    render(<SettingsView {...baseProps} team={owner.team} />)
    fireEvent.click(screen.getByRole('button', { name: 'Équipe & rôles' }))
    expect(screen.getByText('Antoine Dubois')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('adresse@etablissement.fr')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Révoquer' })).toBeNull()
  })

  it('billing: plan card, usage, payment CTA', () => {
    render(<SettingsView {...owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'Facturation' }))
    expect(screen.getByText('Essai gratuit')).toBeInTheDocument()
    expect(screen.getByText('0 €')).toBeInTheDocument()
    expect(screen.getByText('1 / 1 échange utilisé')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir les forfaits' })).toHaveAttribute('href', '/billing')
    expect(screen.getByRole('link', { name: 'Ajouter une carte' })).toHaveAttribute('href', '/billing')
  })

  it('program: stats line, archive modal confirm', async () => {
    const { archiveExchange } = await import('@/actions/settings')
    render(<SettingsView {...owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'Programme' }))
    expect(screen.getByText('10 élèves confirmés · 12 candidatures · échéance dossiers 10 oct')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Archiver le programme…' }))
    expect(screen.getByText('Archiver ce programme ?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Archiver le programme' }))
    expect(archiveExchange).toHaveBeenCalledWith('ex1')
  })

  it('program: archived state shows Restaurer', async () => {
    const { restoreExchange } = await import('@/actions/settings')
    render(<SettingsView {...owner} program={{ ...owner.program, archived: true }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Programme' }))
    expect(screen.getByText('Archivé')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }))
    expect(restoreExchange).toHaveBeenCalledWith('ex1')
  })
})
```

Also update the Task-11 mock of `@/actions/settings` so `inviteOrganizer`, `revokeOrganizerInvite`, `archiveExchange`, `restoreExchange` are `vi.fn().mockResolvedValue(undefined)` (they already exist in the mock — make them resolved mocks).

Run: `pnpm test components/settings` → Expected: FAIL.

- [ ] **Step 2: Extend `SettingsView.tsx`**

```tsx
type SectionKey = 'compte' | 'equipe' | 'fact' | 'prog'

// inside the component:
const sections: { key: SectionKey; label: string }[] = [
  { key: 'compte', label: 'Compte personnel' },
  { key: 'equipe', label: 'Équipe & rôles' },
  ...(props.isOwner ? [{ key: 'fact' as const, label: 'Facturation' }] : []),
  ...(props.isOwner && props.program ? [{ key: 'prog' as const, label: 'Programme' }] : []),
]
```

and in the content column:

```tsx
{section === 'equipe' && <TeamCard team={props.team} isOwner={props.isOwner} />}
{section === 'fact' && props.billing && <BillingCard billing={props.billing} />}
{section === 'prog' && props.program && <ProgramCard program={props.program} />}
```

- [ ] **Step 3: Implement `components/settings/TeamCard.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { inviteOrganizer, revokeOrganizerInvite, type TeamMember, type PendingInvite } from '@/actions/settings'

const MEMBER_AVATARS = ['linear-gradient(135deg,#3B6EF6,#0E1B38)', '#7C5CE0', '#0F8A6D', '#C2543A', '#B0468C']

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
}

export function TeamCard({ team, isOwner }: {
  team: { members: TeamMember[]; pending: PendingInvite[] }
  isOwner: boolean
}) {
  const [invite, setInvite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleInvite() {
    setBusy(true); setError(null); setFlash(null)
    try {
      await inviteOrganizer(invite)
      setInvite('')
      setFlash('Invitation envoyée.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setBusy(false)
  }

  async function handleRevoke(id: string) {
    setError(null)
    try { await revokeOrganizerInvite(id) }
    catch (err) { setError(err instanceof Error ? err.message : 'Une erreur est survenue.') }
  }

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-1 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">Équipe & rôles</div>
      <p className="mb-[18px] text-[12.5px] text-tertiary">
        Invitez des collègues à gérer vos échanges. Seul le propriétaire accède à la facturation.
      </p>

      {isOwner && (
        <div className="flex gap-2.5">
          <input
            value={invite} onChange={e => setInvite(e.target.value)}
            placeholder="adresse@etablissement.fr"
            className="h-10 min-w-0 flex-1 rounded-[9px] border px-3 text-[13.5px] focus:border-brand focus:outline-none"
          />
          <button
            type="button" onClick={handleInvite} disabled={busy}
            className="h-10 flex-none rounded-[9px] bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            Inviter
          </button>
        </div>
      )}
      {(error || flash) && (
        <p className={`mt-2 text-[12.5px] font-medium ${error ? 'text-danger-text' : 'text-success-text'}`}>
          {error ?? flash}
        </p>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-subtle">
        {team.members.map((m, i) => (
          <div key={m.id} className="flex items-center gap-3 border-b border-subtle px-4 py-3 last:border-b-0">
            <span
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ background: MEMBER_AVATARS[i % MEMBER_AVATARS.length] }}
            >
              {initialsOf(m.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[13.5px] font-semibold text-foreground">{m.name}</span>
                {m.isYou && (
                  <span className="rounded-pill bg-tint px-2 py-px font-mono text-[10px] font-semibold text-tint-text">VOUS</span>
                )}
              </span>
              <span className="mt-px block truncate text-xs text-tertiary">{m.email}</span>
            </span>
            {m.isOwner ? (
              <span className="rounded-pill bg-navy px-3 py-[5px] text-[11.5px] font-semibold text-white">Propriétaire</span>
            ) : (
              <span className="rounded-pill bg-subtle px-3 py-[5px] text-[11.5px] font-semibold text-muted-foreground">Administrateur</span>
            )}
          </div>
        ))}
        {team.pending.map(p => (
          <div key={p.id} className="flex items-center gap-3 border-b border-subtle bg-hoverrow px-4 py-3 last:border-b-0">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border-[1.5px] border-dashed border-placeholder text-[13px] font-semibold text-placeholder">@</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium text-muted-foreground">{p.email}</span>
              <span className="mt-px block text-xs text-tertiary">Administrateur</span>
            </span>
            <span className="rounded-pill bg-warn px-2.5 py-[3px] text-[11px] font-semibold text-warn-text">Invitation envoyée</span>
            {isOwner && (
              <button
                type="button" onClick={() => handleRevoke(p.id)}
                className="px-1.5 py-1 text-xs font-semibold text-tertiary hover:text-danger-text"
              >
                Révoquer
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-[11px] border border-subtle px-[15px] py-[13px]">
          <div className="mb-[3px] text-[12.5px] font-semibold text-foreground">Propriétaire</div>
          <div className="text-[11.5px] leading-[1.45] text-tertiary">Tout gérer, y compris l’équipe et la facturation.</div>
        </div>
        <div className="rounded-[11px] border border-subtle px-[15px] py-[13px]">
          <div className="mb-[3px] text-[12.5px] font-semibold text-foreground">Administrateur</div>
          <div className="text-[11.5px] leading-[1.45] text-tertiary">Gérer élèves, candidatures, formulaires et documents.</div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement `components/settings/BillingCard.tsx`**

```tsx
import Link from 'next/link'
import type { BillingOverview } from '@/actions/settings'

export function BillingCard({ billing }: { billing: BillingOverview }) {
  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-[18px] flex items-center justify-between gap-4">
        <div className="font-display text-[15px] font-bold tracking-[-.01em] text-foreground">Facturation</div>
        <Link
          href="/billing"
          className="rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover"
        >
          Voir les forfaits
        </Link>
      </div>
      <div className="rounded-xl border border-subtle px-5 py-[18px]">
        <span className="rounded-pill bg-tint px-2.5 py-[3px] text-[11px] font-semibold text-tint-text">{billing.planLabel}</span>
        <div className="mt-1.5 flex items-baseline gap-[5px]">
          <span className="font-display text-[28px] font-bold leading-none tracking-[-.02em] text-foreground">{billing.price}</span>
          {billing.per && <span className="text-[13px] font-medium text-tertiary">{billing.per}</span>}
        </div>
        <div className="mb-3.5 mt-1 text-[13px] text-muted-foreground">{billing.desc}</div>
        <div className="mb-[5px] h-1.5 overflow-hidden rounded-pill bg-background">
          <div className="h-full rounded-pill bg-brand" style={{ width: `${billing.usagePct}%` }} />
        </div>
        <div className="font-mono text-[11px] font-medium text-tertiary">{billing.usageLabel}</div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-[13.5px] font-semibold text-foreground">Moyen de paiement</div>
          <div className="mt-0.5 text-[12.5px] text-tertiary">{billing.payment.note}</div>
        </div>
        <Link
          href={billing.payment.href}
          className="flex-none rounded-[9px] border px-3.5 py-2 text-[12.5px] font-semibold text-foreground hover:bg-hoverrow"
        >
          {billing.payment.cta}
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Implement `components/settings/ProgramCard.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { archiveExchange, restoreExchange, type ProgramInfo } from '@/actions/settings'
import { frShortDate, p } from '@/lib/dashboard/rollup'

export function ProgramCard({ program }: { program: ProgramInfo }) {
  const router = useRouter()
  const [modal, setModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (err) { setError(err instanceof Error ? err.message : 'Une erreur est survenue.') }
    setBusy(false)
  }

  const stats = [
    `${program.enrolled} élève${p(program.enrolled)} confirmé${p(program.enrolled)}`,
    `${program.applications} candidature${p(program.applications)}`,
    ...(program.earliestDeadline ? [`échéance dossiers ${frShortDate(program.earliestDeadline)}`] : []),
  ].join(' · ')

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-4 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">Programme</div>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-subtle px-[18px] py-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-display text-[15px] font-semibold text-foreground">{program.name} · {program.year}</span>
            {program.archived ? (
              <span className="rounded-pill bg-subtle px-2.5 py-[3px] text-[11px] font-semibold text-muted-foreground">Archivé</span>
            ) : (
              <span className="rounded-pill bg-tint px-2.5 py-[3px] text-[11px] font-semibold text-tint-text">
                {program.phase === 1 ? 'Phase 1 · Recrutement' : 'Phase 2 · Préparation'}
              </span>
            )}
          </div>
          <div className="mt-1 text-[12.5px] text-tertiary">{stats}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-danger bg-danger/40 px-[18px] py-4">
        <div>
          <div className="text-[13.5px] font-semibold text-danger-text">Archiver le programme</div>
          <div className="mt-0.5 text-[12.5px] leading-normal text-danger-text/70">
            Le programme passe en lecture seule. Les dossiers restent consultables, plus aucune modification possible.
          </div>
        </div>
        {program.archived ? (
          <button
            type="button" disabled={busy} onClick={() => run(() => restoreExchange(program.id))}
            className="flex-none rounded-[9px] border bg-card px-3.5 py-2 text-[12.5px] font-semibold text-foreground hover:bg-hoverrow disabled:opacity-50"
          >
            Restaurer
          </button>
        ) : (
          <button
            type="button" onClick={() => setModal(true)}
            className="flex-none rounded-[9px] border border-danger bg-card px-3.5 py-2 text-[12.5px] font-semibold text-danger-text hover:bg-danger disabled:opacity-50"
          >
            Archiver le programme…
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-[12.5px] font-medium text-danger-text">{error}</p>}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-rail/50" role="dialog" aria-modal="true">
          <div className="w-[460px] max-w-[calc(100vw-32px)] rounded-[18px] bg-card p-[30px] shadow-modal">
            <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl bg-danger font-display text-xl font-bold text-danger-text">!</div>
            <div className="mb-2 font-display text-[19px] font-bold tracking-[-.01em] text-foreground">Archiver ce programme ?</div>
            <p className="mb-[22px] text-[13.5px] leading-[1.55] text-muted-foreground">
              « {program.name} · {program.year} » passera en lecture seule : élèves, candidatures et documents resteront
              consultables, mais plus aucune modification ne sera possible. Vous pourrez le restaurer à tout moment.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                type="button" onClick={() => setModal(false)}
                className="rounded-[9px] border px-4 py-2.5 text-[13px] font-semibold text-foreground hover:bg-hoverrow"
              >
                Annuler
              </button>
              <button
                type="button" disabled={busy}
                onClick={() => { setModal(false); void run(() => archiveExchange(program.id)) }}
                className="rounded-[9px] bg-danger-text px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                Archiver le programme
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

Token note: the danger zone uses `bg-danger` (light red pill background token) with `text-danger-text` — verify contrast against `tailwind.config.ts` while implementing; the intent is the handoff's `#FDF3F1` card / `#C0392B` accents. If `bg-danger/40` renders poorly, use plain `bg-danger`.

- [ ] **Step 6: Run tests, gates, commit**

Run: `pnpm test components/settings` → Expected: PASS.
Run: `pnpm lint && pnpm test && npx tsc --noEmit`

```bash
git add components/settings
git commit -m "feat(settings): Équipe & rôles, Facturation, Programme sections + archive modal

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Full gates, migration to prod, live drive, merge

**Files:** none new — verification and rollout.

- [ ] **Step 1: Full local gates on the branch**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`
Expected: zero lint errors, all tests green, clean compile. Fix anything that fails before proceeding.

- [ ] **Step 2: Rebase sanity + diff PII scan**

```bash
git fetch origin && git rebase origin/main
git diff --stat main...HEAD
```

Review the stat list: only files named in this plan; no stray PDFs/uploads (PII).

- [ ] **Step 3: Apply the migration to prod (user-visible checkpoint)**

Announce to the user, then apply `20260704000001_phase4_eleves_reglages.sql` via `supabase db push` (IPv4 session pooler `--db-url` if the network lacks IPv6) or the Supabase MCP `apply_migration`. Verify:
- `select org_role, count(*) from users group by 1` — exactly one `owner` per school with organizers.
- `organizer_invites` exists with RLS enabled; `exchanges.archived_at` exists.
- The migration is registered in `supabase_migrations.schema_migrations` as `20260704000001`.

The migration is additive with defaults — prod behavior is unchanged until the UI deploys.

- [ ] **Step 4: Deploy the updated edge function**

`supabase functions deploy send-reminders` (or MCP `deploy_edge_function`). Smoke-check its logs on the next cron run — or invoke with the CRON secret once — expecting a normal `{ students, emailsSent }` response.

- [ ] **Step 5: Live drive (verification skill — real browser against the dev server)**

1. **Élèves**: `/students` renders the roster from prod-shaped data; chips counts match; top-bar search filters accent-insensitively; detail shows identity + parents from a real accepted application; checklist pills match the dashboard's states; « Candidature » opens the application review; a checklist row with a submission opens the legacy review page.
2. **Relance**: « Relancer » on an incomplete student → confirm one grouped e-mail (controlled address) and `{ reminded: true }`; immediate second click → « Déjà relancé récemment ».
3. **Compte**: edit phone/fonction/établissement → saved flash → values persist after reload; change password (test account) → old rejected, new works; HIBP path: try `password123` → French leak error.
4. **Équipe**: invite a controlled address → e-mail arrives (French) → `/join` accept (name + password) → lands on `/dashboard`; the new member shows in the list without owner controls (log in as them: no Facturation/Programme nav, no invite row); revoke a second pending invite.
5. **Facturation**: trial card shows Essai gratuit / 0 € / usage bar; `/exchanges` plan tiles show Essentiel 199 € / Association 499 € / Réseau 799 €.
6. **Programme/archive**: archive the active exchange → confirm modal copy; top-bar pill « Archivé »; a write (e.g. relance or template activation) rejects with « Programme archivé — lecture seule. »; session-selector row shows the pill; restore → writes work again.
7. **Cron skip**: with the exchange archived, invoke `send-reminders` with the CRON secret → response counts exclude that exchange's students (compare before/after archive, or check the DB `last_reminded_at` stays untouched).
8. Clean up all test data (invites, test organizer account via `auth.admin.deleteUser` + users row, restore phase/archive state, delete relance stamps if they distort future pacing — set `last_reminded_at` back to its pre-drive value).

Steps that mutate the prod DB or send real e-mail require the user's go-ahead first (only one Supabase project — the dev server points at prod).

- [ ] **Step 6: Merge protocol (requires user confirmation)**

```bash
git checkout main && git merge --no-ff redesign/phase-4-eleves-reglages \
  -m "Merge redesign/phase-4-eleves-reglages: Élèves + Réglages pages (Phase 4)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
pnpm lint && pnpm test && npx tsc --noEmit
git push
```

Then update the memory ledger (`project_redesign_phases.md`: Phase 4 DONE) and `.superpowers/sdd/progress.md`.
