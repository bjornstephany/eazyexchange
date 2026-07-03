# Redesign Phase 3 — Formulaires + Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the redesigned `/forms` (Formulaires) and `/documents` (Documents) organizer pages with a draft→active template lifecycle, conditional per-student pièces, PDF template import, a standard template library, manual relance, and a one-shot Phase-2 checklist email.

**Architecture:** Extend `form_templates` with product-level columns (`kind`, `status`, `audience`, `standard_key`, `condition_label`, `template_file_path`) so all existing machinery (assignments, submissions, RLS, reminders, student space) keeps working. Server pages resolve the active exchange from the `ee_active_exchange` cookie, compute rollups via pure functions in `lib/forms/rollup.ts`, and pass serializable props to client views (same pattern as Phase 2's dashboard).

**Tech Stack:** Next.js 14 App Router + Server Actions, Supabase (Postgres/RLS/Storage), Tailwind tokens from Phase 1, Resend email, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-03-redesign-phase3-forms-docs-design.md` — copy strings and layout come from `design_handoff_eazyexchange/Eazyexchange Formulaires.dc.html` and `Eazyexchange Docs.dc.html`.

## Global Constraints

- All new product copy is **French**, verbatim from the handoff files (vouvoiement for organizers, tutoiement in student-facing emails). No English UI strings in new components.
- Styling uses the Phase-1 Tailwind tokens only — `navy, rail, brand, tint, success, warn, danger, hoverrow, placeholder, tertiary, frame, subtle` colors, `font-display` (Schibsted Grotesk) / `font-mono` (IBM Plex Mono), `rounded-pill`, `shadow-float`, `shadow-modal`. No raw hex values in JSX.
- Package manager is **pnpm**. Verification gates: `pnpm lint`, `pnpm test`, `npx tsc --noEmit` (NOT `pnpm build` — local `.env.local` has placeholders, build fails by design).
- **Never log student/parent PII** (emails, names, submission contents). All user-supplied values in email HTML go through the existing `esc()` helper in `lib/email.ts`.
- RLS: no self-referential policies; new access via migration only; never service-role from the browser.
- Work on branch `redesign/phase-3-forms-docs`. Commit after each green task. Merging to `main` deploys to production — requires user confirmation, full gates, and a live drive.
- `supabase db push` hangs on IPv6-less networks — use the IPv4 session pooler `--db-url` if needed (see memory/CLAUDE.md).
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Map

| File | Responsibility |
|---|---|
| `supabase/migrations/20260703000001_forms_docs_phase3.sql` | Columns, checks, trigger gating, activation trigger, `form-templates` bucket + policies, standard-library backfill, `exchanges.phase2_checklist_sent_at` |
| `types/db.ts` | Row/Insert types for the new columns |
| `lib/forms/standard-library.ts` | Canonical standard templates data + `seedStandardTemplates()` |
| `lib/forms/rollup.ts` | Pure pills/progress/stats derivations for both pages |
| `lib/email.ts` | `sendTemplateReminderEmail`, `sendPhase2ChecklistEmail`; `send()` returns success boolean |
| `actions/forms.ts` | `getTemplatesPage`, `createDraftTemplate`, `updateTemplateMeta`, `replaceTemplateFile`, `activateTemplate`, `deleteTemplate`, `remindTemplate` |
| `actions/exchanges.ts` | `createExchange` seeds standard library; `setExchangePhase` sends one-shot checklist |
| `app/(organizer)/forms/page.tsx` + `[templateId]/page.tsx` | Formulaires list + edit routes |
| `app/(organizer)/documents/page.tsx` + `[templateId]/page.tsx` | Documents list + edit routes |
| `components/forms/FormsView.tsx`, `AddFormPanel.tsx`, `FormDrawer.tsx`, `TemplateEditor.tsx`, `PageBanner.tsx`, `StatsCard.tsx` | Formulaires UI (StatsCard/PageBanner shared with docs) |
| `components/documents/DocsView.tsx`, `AddDocPanel.tsx`, `DocDrawer.tsx` | Documents UI |
| `components/FormBuilder.tsx` | Rewritten: French, tokens, fields-only (`showTypes` prop); slot editing removed |
| `components/shell/OrganizerShell.tsx`, `ShellUiContext.tsx`, `RailIcons.tsx` | Formul./Docs rail items, contextual top bar (search + page CTA) |
| `app/(organizer)/exchanges/[id]/page.tsx`, `.../forms/new/page.tsx`, `.../forms/[formId]/page.tsx` | Slimmed detail page; redirect stubs |
| `actions/submissions.ts`, `app/(student)/my-forms/[assignmentId]/page.tsx` | Student « Télécharger le document à signer » link |

Key type used everywhere (defined in Task 3, `lib/forms/rollup.ts`):

```ts
export type TemplateKind = 'online' | 'pdf' | 'doc'
export type AssigneeRow = {
  assignmentId: string; studentId: string; studentName: string
  submissionStatus: 'draft' | 'submitted' | 'approved' | 'rejected' | null
}
export type TemplateVM = {
  id: string; kind: TemplateKind; status: 'draft' | 'active'; audience: 'all' | 'conditional'
  name: string; description: string | null; deadline: string | null
  standard_key: string | null; condition_label: string | null; template_file_path: string | null
  fields: string[]            // form_fields labels (online questions / pdf paper checklist)
  assignees: AssigneeRow[]
}
```

---

### Task 1: Branch, migration, types

**Files:**
- Create: `supabase/migrations/20260703000001_forms_docs_phase3.sql`
- Modify: `types/db.ts`

**Interfaces:**
- Produces: DB columns `form_templates.{kind,status,audience,standard_key,condition_label,template_file_path}`, nullable `deadline`, `exchanges.phase2_checklist_sent_at`, bucket `form-templates` (path `{school_id}/{template_id}.pdf`), and TS types `FormTemplate` (new fields), `TemplateKind = 'online' | 'pdf' | 'doc'` re-exported from `types/db.ts`.
- Standard-key values used by all later tasks: forms `sante, decharge, photo, accueil`; docs `passeport, ast, idp1, idp2, livret, medical2`.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b redesign/phase-3-forms-docs
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260703000001_forms_docs_phase3.sql`:

```sql
-- Phase 3 (Formulaires + Documents): product-level template columns, draft
-- lifecycle, conditional audience, PDF template storage, standard library.

-- 1 · Columns ---------------------------------------------------------------
alter table form_templates
  add column kind text not null default 'doc',
  add column status text not null default 'active',
  add column audience text not null default 'all',
  add column standard_key text,
  add column condition_label text,
  add column template_file_path text;

-- Backfill kind from the legacy type before adding coherence checks.
update form_templates set kind = case when type = 'data_entry' then 'online' else 'doc' end;

alter table form_templates alter column deadline drop not null;

alter table form_templates
  add constraint form_templates_kind_check check (kind in ('online', 'pdf', 'doc')),
  add constraint form_templates_status_check check (status in ('draft', 'active')),
  add constraint form_templates_audience_check check (audience in ('all', 'conditional')),
  -- kind='online' ⇔ type='data_entry'; pdf/doc ⇔ document_upload
  add constraint form_templates_kind_type_coherent check (
    (kind = 'online' and type = 'data_entry')
    or (kind in ('pdf', 'doc') and type = 'document_upload')
  ),
  -- an active template always has a deadline (drafts may not)
  add constraint form_templates_active_has_deadline check (status = 'draft' or deadline is not null),
  -- only pièces (docs) can be conditional
  add constraint form_templates_conditional_is_doc check (audience = 'all' or kind = 'doc');

create unique index form_templates_standard_key_unique
  on form_templates (exchange_id, standard_key) where standard_key is not null;

alter table exchanges add column phase2_checklist_sent_at timestamptz;

-- 2 · Trigger gating ---------------------------------------------------------
-- Auto-assign only ACTIVE templates for EVERYONE ('all'). Draft and conditional
-- templates get assignments from the activation server action instead.
create or replace function assign_students_to_new_template()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and new.audience = 'all' then
    insert into assignments (template_id, student_id)
    select new.id, u.id
    from exchange_enrollments e
    join users u on u.id = e.user_id
    where e.exchange_id = new.exchange_id
      and u.school_id = new.school_id
      and u.role = 'student'
    on conflict (template_id, student_id) do nothing;
  end if;
  return new;
end;
$$;

-- draft → active on an 'all' template assigns every enrolled student.
create or replace function assign_students_on_activation()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'draft' and new.status = 'active' and new.audience = 'all' then
    insert into assignments (template_id, student_id)
    select new.id, u.id
    from exchange_enrollments e
    join users u on u.id = e.user_id
    where e.exchange_id = new.exchange_id
      and u.school_id = new.school_id
      and u.role = 'student'
    on conflict (template_id, student_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_on_template_activate on form_templates;
create trigger trg_assign_on_template_activate
  after update on form_templates for each row
  execute function assign_students_on_activation();

-- New enrollment: only active 'all' templates. New enrollees are NOT
-- auto-added to conditional docs — the organizer chooses.
create or replace function assign_templates_to_new_enrollment()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into assignments (template_id, student_id)
  select ft.id, new.user_id
  from form_templates ft
  join users u on u.id = new.user_id
  where ft.exchange_id = new.exchange_id
    and ft.school_id = u.school_id
    and ft.status = 'active'
    and ft.audience = 'all'
    and u.role = 'student'
  on conflict (template_id, student_id) do nothing;
  return new;
end;
$$;

-- 3 · Storage bucket for organizer-uploaded PDF templates --------------------
-- Object keys: <school_id>/<template_id>.pdf
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-templates', 'form-templates', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "organizers manage school template files" on storage.objects
  for all
  using (
    bucket_id = 'form-templates'
    and my_role() = 'organizer'
    and (storage.foldername(name))[1] = my_school_id()::text
  )
  with check (
    bucket_id = 'form-templates'
    and my_role() = 'organizer'
    and (storage.foldername(name))[1] = my_school_id()::text
  );

-- Students may download the PDF of templates they are assigned.
create policy "students read assigned template files" on storage.objects
  for select
  using (
    bucket_id = 'form-templates'
    and exists (
      select 1 from assignments a
      where a.student_id = auth.uid()
        and storage.filename(name) = a.template_id::text || '.pdf'
    )
  );

-- 4 · Standard-library backfill for existing exchanges -----------------------
-- Frozen SQL snapshot of lib/forms/standard-library.ts (which owns the data
-- for exchanges created from now on). All items are drafts, so the gated
-- triggers stay silent. created_by = any organizer of the owning school;
-- exchanges without one are skipped.
with owner as (
  select e.id as exchange_id, e.school_a_id as school_id, u.id as user_id
  from exchanges e
  join lateral (
    select id from users
    where school_id = e.school_a_id and role = 'organizer' limit 1
  ) u on true
),
tpl (standard_key, kind, type, audience, name, description, condition_label) as (
  values
    ('sante', 'pdf', 'document_upload', 'all', 'Formulaire de santé',
     'Antécédents médicaux, allergies, traitements en cours et contacts d''urgence.', null),
    ('decharge', 'pdf', 'document_upload', 'all', 'Décharge de responsabilité',
     'Autorisation parentale de participation et décharge de responsabilité pour la durée du séjour.', null),
    ('photo', 'pdf', 'document_upload', 'all', 'Consentement photo',
     'Droit à l''image de l''élève : photos et vidéos pendant l''échange.', null),
    ('accueil', 'online', 'data_entry', 'all', 'Conditions d''accueil',
     'Composition du foyer, chambre, alimentation et animaux — rempli en ligne par la famille d''accueil.', null),
    ('passeport', 'doc', 'document_upload', 'all', 'Passeport',
     'Copie du passeport en cours de validité (valide 6 mois après le retour).', null),
    ('ast', 'doc', 'document_upload', 'all', 'AST — autorisation de sortie du territoire',
     'Formulaire CERFA 15646 signé par un titulaire de l''autorité parentale, avec copie de sa pièce d''identité.', null),
    ('idp1', 'doc', 'document_upload', 'all', 'Pièce d''identité parent 1',
     'Carte d''identité ou passeport du représentant légal signataire de l''AST.', null),
    ('idp2', 'doc', 'document_upload', 'all', 'Pièce d''identité parent 2',
     'Carte d''identité ou passeport du second représentant légal, le cas échéant.', null),
    ('livret', 'doc', 'document_upload', 'conditional', 'Livret de famille',
     'Pages parents + enfant, demandé uniquement en cas de séparation pour justifier l''autorité parentale.', 'si parents divorcés'),
    ('medical2', 'doc', 'document_upload', 'conditional', 'Formulaire médical complémentaire',
     'Complément demandé lorsque le formulaire de santé signale un traitement ou une allergie sévère.', 'si avis médical requis')
)
insert into form_templates
  (exchange_id, school_id, name, description, type, kind, status, audience,
   standard_key, condition_label, created_by, deadline)
select o.exchange_id, o.school_id, t.name, t.description, t.type, t.kind,
       'draft', t.audience, t.standard_key, t.condition_label, o.user_id, null
from owner o cross join tpl t
where not exists (
  select 1 from form_templates ft
  where ft.exchange_id = o.exchange_id and ft.standard_key = t.standard_key
);

-- One upload slot per backfilled pdf/doc template (label = template name).
insert into document_slots (template_id, label, description, required, "order")
select ft.id, ft.name, null, true, 0
from form_templates ft
where ft.standard_key is not null
  and ft.type = 'document_upload'
  and not exists (select 1 from document_slots ds where ds.template_id = ft.id);

-- Online questions for « Conditions d'accueil ».
insert into form_fields (template_id, label, field_type, required, "order")
select ft.id, f.label, f.field_type, true, f.ord
from form_templates ft
cross join (values
  ('Frères / sœurs au domicile', 'text', 0),
  ('Animaux domestiques', 'text', 1),
  ('Spécificités alimentaires', 'text', 2),
  ('Allergies au domicile', 'text', 3),
  ('Langue(s) parlée(s) en famille', 'text', 4),
  ('Tabac au domicile', 'checkbox', 5),
  ('Chambre individuelle', 'checkbox', 6),
  ('Échange mixte accepté', 'checkbox', 7)
) f(label, field_type, ord)
where ft.standard_key = 'accueil'
  and not exists (select 1 from form_fields x where x.template_id = ft.id);

-- Informational paper checklists for the standard PDF forms (shown in the
-- drawer as « Champs à renseigner »; the student flow ignores form_fields on
-- document_upload templates).
insert into form_fields (template_id, label, field_type, required, "order")
select ft.id, f.label, 'text', true, f.ord
from form_templates ft
join (values
  ('sante', 'Groupe sanguin', 0), ('sante', 'Allergies connues', 1),
  ('sante', 'Traitements en cours', 2), ('sante', 'Régime alimentaire particulier', 3),
  ('sante', 'Vaccins à jour', 4), ('sante', 'Médecin traitant', 5),
  ('sante', 'Personne à prévenir (1)', 6), ('sante', 'Personne à prévenir (2)', 7),
  ('sante', 'Autorisation de soins d''urgence', 8),
  ('decharge', 'Autorisation de participation au programme', 0),
  ('decharge', 'Décharge de responsabilité', 1),
  ('decharge', 'Autorisation de déplacement / transport', 2),
  ('decharge', 'Assurance responsabilité civile', 3),
  ('decharge', 'Signature — représentant légal 1', 4),
  ('decharge', 'Signature — représentant légal 2', 5),
  ('photo', 'Photos de groupe pendant le séjour', 0),
  ('photo', 'Publication sur les réseaux sociaux', 1),
  ('photo', 'Site & supports de l''établissement', 2),
  ('photo', 'Presse locale / partenaires', 3),
  ('photo', 'Signature du représentant légal', 4)
) f(key, label, ord) on f.key = ft.standard_key
where not exists (select 1 from form_fields x where x.template_id = ft.id);
```

- [ ] **Step 3: Update `types/db.ts`**

Replace the `FormType` line and `FormTemplate`/`Exchange` types, and loosen the `form_templates` Insert:

```ts
export type FormType = 'data_entry' | 'document_upload'
export type TemplateKind = 'online' | 'pdf' | 'doc'
export type TemplateStatus = 'draft' | 'active'
export type TemplateAudience = 'all' | 'conditional'
```

```ts
export type Exchange = {
  id: string; name: string; year: number
  school_a_id: string; school_b_id: string; created_at: string
  application_open: boolean
  application_deadline: string | null
  apply_slug: string | null
  phase: number
  phase2_checklist_sent_at: string | null
}
```

```ts
export type FormTemplate = {
  id: string; exchange_id: string; school_id: string
  name: string; description: string | null; type: FormType
  deadline: string | null; created_by: string; created_at: string
  kind: TemplateKind; status: TemplateStatus; audience: TemplateAudience
  standard_key: string | null; condition_label: string | null
  template_file_path: string | null
}
```

In the `Database` type, update the two rows:

```ts
      exchanges: TableDef<Exchange, Omit<Exchange, 'id' | 'created_at' | 'application_open' | 'application_deadline' | 'apply_slug' | 'phase' | 'phase2_checklist_sent_at'> & Partial<Pick<Exchange, 'application_open' | 'application_deadline' | 'apply_slug' | 'phase' | 'phase2_checklist_sent_at'>>, Partial<Exchange>>
```

```ts
      form_templates: TableDef<FormTemplate, Omit<FormTemplate, 'id' | 'created_at' | 'deadline' | 'standard_key' | 'condition_label' | 'template_file_path'> & Partial<Pick<FormTemplate, 'deadline' | 'standard_key' | 'condition_label' | 'template_file_path'>>, Partial<FormTemplate>>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (nothing consumes the new fields yet; `deadline: string | null` may surface errors in `lib/dashboard/rollup.ts` consumers — if `TemplateInfo` complains, leave it: it is fed only active templates; fix call sites by non-null asserting at the dashboard page mapping ONLY if tsc actually errors).

- [ ] **Step 5: Apply the migration to the remote DB**

Run: `supabase db push` (fall back to `supabase db push --db-url "$IPV4_POOLER_URL"` if it hangs at "Initialising login role...").
Expected: migration `20260703000001` applied. Verify with: `supabase migration list` showing it in both columns.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260703000001_forms_docs_phase3.sql types/db.ts
git commit -m "feat(forms): phase-3 schema — template kind/status/audience, PDF storage, standard-library backfill

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Standard library (TS) + seeding on exchange creation

**Files:**
- Create: `lib/forms/standard-library.ts`
- Modify: `actions/exchanges.ts` (createExchange)
- Test: `lib/forms/__tests__/standard-library.test.ts`

**Interfaces:**
- Consumes: DB columns from Task 1.
- Produces: `STANDARD_TEMPLATES: StandardTemplate[]` and `seedStandardTemplates(supabase, opts: { exchangeId: string; schoolId: string; userId: string }): Promise<void>`, where `StandardTemplate = { key: string; kind: 'online'|'pdf'|'doc'; audience: 'all'|'conditional'; name: string; description: string; condition_label: string | null; fields: { label: string; field_type: 'text'|'checkbox' }[] }`.

- [ ] **Step 1: Write the failing test**

Create `lib/forms/__tests__/standard-library.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { STANDARD_TEMPLATES, seedStandardTemplates } from '@/lib/forms/standard-library'

describe('STANDARD_TEMPLATES', () => {
  it('defines the 10 standard items with unique keys', () => {
    expect(STANDARD_TEMPLATES).toHaveLength(10)
    const keys = STANDARD_TEMPLATES.map(t => t.key)
    expect(new Set(keys).size).toBe(10)
    expect(keys).toEqual(expect.arrayContaining([
      'sante', 'decharge', 'photo', 'accueil',
      'passeport', 'ast', 'idp1', 'idp2', 'livret', 'medical2',
    ]))
  })
  it('has 4 forms (3 pdf + 1 online with 8 questions) and 6 docs (2 conditional)', () => {
    const forms = STANDARD_TEMPLATES.filter(t => t.kind !== 'doc')
    const docs = STANDARD_TEMPLATES.filter(t => t.kind === 'doc')
    expect(forms).toHaveLength(4)
    expect(forms.filter(t => t.kind === 'pdf')).toHaveLength(3)
    expect(forms.find(t => t.key === 'accueil')?.fields).toHaveLength(8)
    expect(docs).toHaveLength(6)
    expect(docs.filter(t => t.audience === 'conditional').map(t => t.key).sort()).toEqual(['livret', 'medical2'])
    expect(docs.find(t => t.key === 'livret')?.condition_label).toBe('si parents divorcés')
  })
  it('conditional items are docs only and every pdf has a paper checklist', () => {
    for (const t of STANDARD_TEMPLATES) {
      if (t.audience === 'conditional') expect(t.kind).toBe('doc')
      if (t.kind === 'pdf') expect(t.fields.length).toBeGreaterThan(0)
      if (t.kind === 'doc') expect(t.fields).toHaveLength(0)
    }
  })
})

describe('seedStandardTemplates', () => {
  it('inserts 10 templates as drafts, slots for pdf/doc, fields for online+pdf', async () => {
    const templateInserts: any[] = []
    const slotInserts: any[] = []
    const fieldInserts: any[] = []
    let nextId = 0
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'form_templates') {
          return { insert: (row: any) => ({ select: () => ({ single: async () => {
            templateInserts.push(row); return { data: { id: `t${nextId++}` }, error: null }
          } }) }) }
        }
        if (table === 'document_slots') {
          return { insert: async (rows: any) => { slotInserts.push(...[].concat(rows)); return { error: null } } }
        }
        // form_fields
        return { insert: async (rows: any) => { fieldInserts.push(...[].concat(rows)); return { error: null } } }
      }),
    }
    await seedStandardTemplates(supabase as any, { exchangeId: 'ex1', schoolId: 's1', userId: 'u1' })
    expect(templateInserts).toHaveLength(10)
    expect(templateInserts.every(r => r.status === 'draft' && r.exchange_id === 'ex1' && r.school_id === 's1' && r.created_by === 'u1')).toBe(true)
    expect(slotInserts).toHaveLength(9) // 3 pdf forms + 6 docs
    // 8 accueil questions + 9+6+5 pdf checklist labels
    expect(fieldInserts).toHaveLength(8 + 9 + 6 + 5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/forms/__tests__/standard-library.test.ts`
Expected: FAIL — cannot resolve `@/lib/forms/standard-library`.

- [ ] **Step 3: Implement `lib/forms/standard-library.ts`**

```ts
// Canonical standard-template library, seeded as drafts for every new
// exchange. The SQL backfill in 20260703000001 is a frozen snapshot of this
// data for exchanges that existed before Phase 3.
import type { SupabaseClient } from '@supabase/supabase-js'

export type StandardField = { label: string; field_type: 'text' | 'checkbox' }
export type StandardTemplate = {
  key: string
  kind: 'online' | 'pdf' | 'doc'
  audience: 'all' | 'conditional'
  name: string
  description: string
  condition_label: string | null
  fields: StandardField[]
}

const t = (label: string): StandardField => ({ label, field_type: 'text' })
const c = (label: string): StandardField => ({ label, field_type: 'checkbox' })

export const STANDARD_TEMPLATES: StandardTemplate[] = [
  {
    key: 'sante', kind: 'pdf', audience: 'all', name: 'Formulaire de santé', condition_label: null,
    description: 'Antécédents médicaux, allergies, traitements en cours et contacts d’urgence.',
    fields: [t('Groupe sanguin'), t('Allergies connues'), t('Traitements en cours'),
      t('Régime alimentaire particulier'), t('Vaccins à jour'), t('Médecin traitant'),
      t('Personne à prévenir (1)'), t('Personne à prévenir (2)'), t('Autorisation de soins d’urgence')],
  },
  {
    key: 'decharge', kind: 'pdf', audience: 'all', name: 'Décharge de responsabilité', condition_label: null,
    description: 'Autorisation parentale de participation et décharge de responsabilité pour la durée du séjour.',
    fields: [t('Autorisation de participation au programme'), t('Décharge de responsabilité'),
      t('Autorisation de déplacement / transport'), t('Assurance responsabilité civile'),
      t('Signature — représentant légal 1'), t('Signature — représentant légal 2')],
  },
  {
    key: 'photo', kind: 'pdf', audience: 'all', name: 'Consentement photo', condition_label: null,
    description: 'Droit à l’image de l’élève : photos et vidéos pendant l’échange.',
    fields: [t('Photos de groupe pendant le séjour'), t('Publication sur les réseaux sociaux'),
      t('Site & supports de l’établissement'), t('Presse locale / partenaires'),
      t('Signature du représentant légal')],
  },
  {
    key: 'accueil', kind: 'online', audience: 'all', name: 'Conditions d’accueil', condition_label: null,
    description: 'Composition du foyer, chambre, alimentation et animaux — rempli en ligne par la famille d’accueil.',
    fields: [t('Frères / sœurs au domicile'), t('Animaux domestiques'), t('Spécificités alimentaires'),
      t('Allergies au domicile'), t('Langue(s) parlée(s) en famille'), c('Tabac au domicile'),
      c('Chambre individuelle'), c('Échange mixte accepté')],
  },
  {
    key: 'passeport', kind: 'doc', audience: 'all', name: 'Passeport', condition_label: null,
    description: 'Copie du passeport en cours de validité (valide 6 mois après le retour).', fields: [],
  },
  {
    key: 'ast', kind: 'doc', audience: 'all', name: 'AST — autorisation de sortie du territoire', condition_label: null,
    description: 'Formulaire CERFA 15646 signé par un titulaire de l’autorité parentale, avec copie de sa pièce d’identité.', fields: [],
  },
  {
    key: 'idp1', kind: 'doc', audience: 'all', name: 'Pièce d’identité parent 1', condition_label: null,
    description: 'Carte d’identité ou passeport du représentant légal signataire de l’AST.', fields: [],
  },
  {
    key: 'idp2', kind: 'doc', audience: 'all', name: 'Pièce d’identité parent 2', condition_label: null,
    description: 'Carte d’identité ou passeport du second représentant légal, le cas échéant.', fields: [],
  },
  {
    key: 'livret', kind: 'doc', audience: 'conditional', name: 'Livret de famille', condition_label: 'si parents divorcés',
    description: 'Pages parents + enfant, demandé uniquement en cas de séparation pour justifier l’autorité parentale.', fields: [],
  },
  {
    key: 'medical2', kind: 'doc', audience: 'conditional', name: 'Formulaire médical complémentaire', condition_label: 'si avis médical requis',
    description: 'Complément demandé lorsque le formulaire de santé signale un traitement ou une allergie sévère.', fields: [],
  },
]

// Insert the whole library as drafts for a fresh exchange. Caller must be an
// organizer of `schoolId` (RLS enforces it). Drafts have no deadline and no
// assignments (the gated triggers skip them).
export async function seedStandardTemplates(
  supabase: SupabaseClient,
  opts: { exchangeId: string; schoolId: string; userId: string },
): Promise<void> {
  for (const std of STANDARD_TEMPLATES) {
    const { data, error } = await supabase
      .from('form_templates')
      .insert({
        exchange_id: opts.exchangeId,
        school_id: opts.schoolId,
        name: std.name,
        description: std.description,
        type: std.kind === 'online' ? 'data_entry' : 'document_upload',
        kind: std.kind,
        status: 'draft',
        audience: std.audience,
        standard_key: std.key,
        condition_label: std.condition_label,
        deadline: null,
        created_by: opts.userId,
      })
      .select('id')
      .single()
    if (error) throw error
    const templateId = data.id as string

    if (std.kind !== 'online') {
      const { error: slotError } = await supabase
        .from('document_slots')
        .insert({ template_id: templateId, label: std.name, description: null, required: true, order: 0 })
      if (slotError) throw slotError
    }
    if (std.fields.length > 0) {
      const { error: fieldError } = await supabase
        .from('form_fields')
        .insert(std.fields.map((f, i) => ({
          template_id: templateId, label: f.label, field_type: f.field_type, required: true, order: i,
        })))
      if (fieldError) throw fieldError
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/forms/__tests__/standard-library.test.ts`
Expected: PASS.

- [ ] **Step 5: Seed from `createExchange`**

In `actions/exchanges.ts`, add the import and call `seedStandardTemplates` right after the exchange insert succeeds (before the cookie block):

```ts
import { seedStandardTemplates } from '@/lib/forms/standard-library'
```

```ts
  if (error) throw error

  await seedStandardTemplates(supabase, {
    exchangeId: createdExchange.id,
    schoolId: profile.school_id,
    userId: user.id,
  })
```

- [ ] **Step 6: Extend the createExchange test**

In `actions/__tests__/create-exchange.test.ts`, the mocked `from()` must now also answer `form_templates`, `document_slots`, `form_fields` inserts. Add to the existing mock's table switch (match the file's existing stub style):

```ts
  if (table === 'form_templates') {
    return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'tpl-1' }, error: null }) }) }) }
  }
  if (table === 'document_slots' || table === 'form_fields') {
    return { insert: async () => ({ error: null }) }
  }
```

Add one assertion to the happy-path test: after `createExchange`, `from` was called with `'form_templates'`.

- [ ] **Step 7: Run the full affected tests**

Run: `pnpm vitest run lib/forms actions/__tests__/create-exchange.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/forms/standard-library.ts lib/forms/__tests__/standard-library.test.ts actions/exchanges.ts actions/__tests__/create-exchange.test.ts
git commit -m "feat(forms): standard template library seeded on exchange creation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Rollup derivations (`lib/forms/rollup.ts`)

**Files:**
- Create: `lib/forms/rollup.ts`
- Test: `lib/forms/__tests__/rollup.test.ts`

**Interfaces:**
- Consumes: `Pill`, `p`, `frShortDate` from `@/lib/dashboard/rollup`.
- Produces (exact signatures — later tasks import these):

```ts
export type TemplateKind = 'online' | 'pdf' | 'doc'
export type AssigneeRow = { assignmentId: string; studentId: string; studentName: string; submissionStatus: 'draft' | 'submitted' | 'approved' | 'rejected' | null }
export type TemplateVM = { id: string; kind: TemplateKind; status: 'draft' | 'active'; audience: 'all' | 'conditional'; name: string; description: string | null; deadline: string | null; standard_key: string | null; condition_label: string | null; template_file_path: string | null; fields: string[]; assignees: AssigneeRow[] }
export function typePill(kind: TemplateKind): Pill
export function statusPill(status: 'draft' | 'active'): Pill
export function reqPill(t: Pick<TemplateVM, 'audience' | 'condition_label'>): Pill
export function formDone(assignees: AssigneeRow[]): number        // submitted|approved
export function docDone(assignees: AssigneeRow[]): number         // approved
export function progressLabel(t: TemplateVM): string
export function progressPct(t: TemplateVM): number                // 0–100
export function docAttentionPill(t: TemplateVM): Pill
export function studentPill(status: AssigneeRow['submissionStatus']): Pill | null // null = fourni (folded)
export function docDrawerRows(assignees: AssigneeRow[]): { rows: { assignmentId: string; name: string; initials: string; pill: Pill; review: boolean }[]; restCount: number }
export function formsStats(vms: TemplateVM[]): { activeCount: number; done: number; total: number }
export function docsStats(vms: TemplateVM[]): { docCount: number; reviewCount: number; done: number; total: number }
export function earliestActiveDeadline(vms: TemplateVM[]): string | null
export function initials(name: string): string
```

- [ ] **Step 1: Write the failing test**

Create `lib/forms/__tests__/rollup.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  typePill, statusPill, reqPill, formDone, docDone, progressLabel, progressPct,
  docAttentionPill, studentPill, docDrawerRows, formsStats, docsStats,
  earliestActiveDeadline, initials, type TemplateVM, type AssigneeRow,
} from '@/lib/forms/rollup'

const a = (id: string, s: AssigneeRow['submissionStatus']): AssigneeRow =>
  ({ assignmentId: `as-${id}`, studentId: id, studentName: `Élève ${id}`, submissionStatus: s })

const base: Omit<TemplateVM, 'kind' | 'status' | 'assignees'> = {
  id: 't1', audience: 'all', name: 'Passeport', description: null,
  // realistic timestamptz, not date-only (Phase-2 lesson)
  deadline: '2026-10-10T00:00:00+00:00',
  standard_key: 'passeport', condition_label: null, template_file_path: null, fields: [],
}
const vm = (over: Partial<TemplateVM>): TemplateVM =>
  ({ ...base, kind: 'doc', status: 'active', assignees: [], ...over })

describe('pills', () => {
  it('type pills', () => {
    expect(typePill('pdf')).toEqual({ kind: 'neutral', label: 'PDF · à signer' })
    expect(typePill('online')).toEqual({ kind: 'info', label: 'Formulaire en ligne' })
  })
  it('status pills', () => {
    expect(statusPill('active')).toEqual({ kind: 'ok', label: 'Actif' })
    expect(statusPill('draft')).toEqual({ kind: 'warn', label: 'Brouillon' })
  })
  it('req pills', () => {
    expect(reqPill({ audience: 'all', condition_label: null })).toEqual({ kind: 'info', label: 'Obligatoire' })
    expect(reqPill({ audience: 'conditional', condition_label: 'si parents divorcés' })).toEqual({ kind: 'neutral', label: 'si parents divorcés' })
    expect(reqPill({ audience: 'conditional', condition_label: null })).toEqual({ kind: 'neutral', label: 'selon situation' })
  })
})

describe('progress', () => {
  const assignees = [a('1', 'approved'), a('2', 'submitted'), a('3', 'draft'), a('4', null), a('5', 'rejected')]
  it('formDone counts submitted+approved; docDone only approved', () => {
    expect(formDone(assignees)).toBe(2)
    expect(docDone(assignees)).toBe(1)
  })
  it('labels per kind and draft state', () => {
    expect(progressLabel(vm({ kind: 'online', assignees }))).toBe('2 / 5 reçus')
    expect(progressLabel(vm({ kind: 'doc', assignees }))).toBe('1 / 5 fourni')
    expect(progressLabel(vm({ kind: 'doc', assignees: [a('1', 'approved'), a('2', 'approved')] }))).toBe('2 / 2 fournis')
    expect(progressLabel(vm({ kind: 'online', status: 'draft', assignees: [] }))).toBe('Pas encore envoyé')
    expect(progressLabel(vm({ kind: 'doc', status: 'draft', assignees: [] }))).toBe('Pas encore demandé')
  })
  it('pct rounds and survives zero totals', () => {
    expect(progressPct(vm({ kind: 'doc', assignees }))).toBe(20)
    expect(progressPct(vm({ kind: 'doc', assignees: [] }))).toBe(0)
  })
})

describe('doc attention pill', () => {
  it('priority: brouillon > manquants > à vérifier > complet', () => {
    expect(docAttentionPill(vm({ status: 'draft' }))).toEqual({ kind: 'warn', label: 'Brouillon' })
    expect(docAttentionPill(vm({ assignees: [a('1', null), a('2', 'rejected'), a('3', 'approved')] })))
      .toEqual({ kind: 'bad', label: '2 manquants' })
    expect(docAttentionPill(vm({ assignees: [a('1', null), a('2', 'approved')] })))
      .toEqual({ kind: 'bad', label: '1 manquant' })
    expect(docAttentionPill(vm({ assignees: [a('1', 'submitted'), a('2', 'approved')] })))
      .toEqual({ kind: 'info', label: '1 à vérifier' })
    expect(docAttentionPill(vm({ assignees: [a('1', 'approved')] })))
      .toEqual({ kind: 'ok', label: 'Complet' })
  })
})

describe('drawer rows', () => {
  it('folds approved into restCount, pills the others, flags review rows', () => {
    const { rows, restCount } = docDrawerRows([
      a('1', 'approved'), a('2', 'submitted'), a('3', 'draft'), a('4', null), a('5', 'rejected'),
    ])
    expect(restCount).toBe(1)
    expect(rows.map(r => r.pill.label)).toEqual(['À vérifier', 'En cours', 'Manquant', 'À refaire'])
    expect(rows[0].review).toBe(true)
    expect(rows[1].review).toBe(false)
    expect(rows[0].initials).toBe('É2')
  })
  it('studentPill returns null for approved', () => {
    expect(studentPill('approved')).toBeNull()
    expect(studentPill(null)).toEqual({ kind: 'bad', label: 'Manquant' })
    expect(studentPill('rejected')).toEqual({ kind: 'bad', label: 'À refaire' })
  })
})

describe('stats', () => {
  const forms = [
    vm({ kind: 'online', assignees: [a('1', 'approved'), a('2', null)] }),
    vm({ kind: 'pdf', status: 'draft', assignees: [] }),
  ]
  const docs = [
    vm({ kind: 'doc', assignees: [a('1', 'approved'), a('2', 'submitted')] }),
    vm({ kind: 'doc', status: 'draft', deadline: null, assignees: [] }),
  ]
  it('formsStats over active only', () => {
    expect(formsStats(forms)).toEqual({ activeCount: 1, done: 1, total: 2 })
  })
  it('docsStats: docCount all, sums over active', () => {
    expect(docsStats(docs)).toEqual({ docCount: 2, reviewCount: 1, done: 1, total: 2 })
  })
  it('earliestActiveDeadline ignores drafts and nulls', () => {
    expect(earliestActiveDeadline(docs)).toBe('2026-10-10T00:00:00+00:00')
    expect(earliestActiveDeadline([vm({ status: 'draft' })])).toBeNull()
  })
})

describe('initials', () => {
  it('two-word and single-word names', () => {
    expect(initials('Manon Girard')).toBe('MG')
    expect(initials('Manon')).toBe('M')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/forms/__tests__/rollup.test.ts`
Expected: FAIL — cannot resolve `@/lib/forms/rollup`.

- [ ] **Step 3: Implement `lib/forms/rollup.ts`**

```ts
// Pure derivations for the Formulaires and Documents pages. No React, no
// Supabase. Pill vocabulary and counting rules come from the Phase-3 spec:
// forms « reçus » = submitted|approved; docs « fournis » = approved only.
import { p, type Pill } from '@/lib/dashboard/rollup'

export type TemplateKind = 'online' | 'pdf' | 'doc'
export type AssigneeRow = {
  assignmentId: string
  studentId: string
  studentName: string
  submissionStatus: 'draft' | 'submitted' | 'approved' | 'rejected' | null
}
export type TemplateVM = {
  id: string
  kind: TemplateKind
  status: 'draft' | 'active'
  audience: 'all' | 'conditional'
  name: string
  description: string | null
  deadline: string | null
  standard_key: string | null
  condition_label: string | null
  template_file_path: string | null
  fields: string[]
  assignees: AssigneeRow[]
}

export function typePill(kind: TemplateKind): Pill {
  return kind === 'online'
    ? { kind: 'info', label: 'Formulaire en ligne' }
    : { kind: 'neutral', label: 'PDF · à signer' }
}

export function statusPill(status: 'draft' | 'active'): Pill {
  return status === 'active' ? { kind: 'ok', label: 'Actif' } : { kind: 'warn', label: 'Brouillon' }
}

export function reqPill(t: Pick<TemplateVM, 'audience' | 'condition_label'>): Pill {
  return t.audience === 'conditional'
    ? { kind: 'neutral', label: t.condition_label ?? 'selon situation' }
    : { kind: 'info', label: 'Obligatoire' }
}

export function formDone(assignees: AssigneeRow[]): number {
  return assignees.filter(x => x.submissionStatus === 'submitted' || x.submissionStatus === 'approved').length
}

export function docDone(assignees: AssigneeRow[]): number {
  return assignees.filter(x => x.submissionStatus === 'approved').length
}

export function progressLabel(t: TemplateVM): string {
  if (t.status === 'draft') return t.kind === 'doc' ? 'Pas encore demandé' : 'Pas encore envoyé'
  const total = t.assignees.length
  if (t.kind === 'doc') {
    const done = docDone(t.assignees)
    return `${done} / ${total} fourni${p(done)}`
  }
  return `${formDone(t.assignees)} / ${total} reçus`
}

export function progressPct(t: TemplateVM): number {
  const total = t.assignees.length
  if (t.status === 'draft' || total === 0) return 0
  const done = t.kind === 'doc' ? docDone(t.assignees) : formDone(t.assignees)
  return Math.round((done / total) * 100)
}

export function docAttentionPill(t: TemplateVM): Pill {
  if (t.status === 'draft') return { kind: 'warn', label: 'Brouillon' }
  const review = t.assignees.filter(x => x.submissionStatus === 'submitted').length
  const missing = t.assignees.length - docDone(t.assignees) - review
  if (missing > 0) return { kind: 'bad', label: `${missing} manquant${p(missing)}` }
  if (review > 0) return { kind: 'info', label: `${review} à vérifier` }
  return { kind: 'ok', label: 'Complet' }
}

// null = fourni et validé (folded into the rest row)
export function studentPill(status: AssigneeRow['submissionStatus']): Pill | null {
  switch (status) {
    case 'approved': return null
    case 'submitted': return { kind: 'info', label: 'À vérifier' }
    case 'draft': return { kind: 'warn', label: 'En cours' }
    case 'rejected': return { kind: 'bad', label: 'À refaire' }
    default: return { kind: 'bad', label: 'Manquant' }
  }
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => (w[0] ?? '').toUpperCase()).join('')
}

export function docDrawerRows(assignees: AssigneeRow[]): {
  rows: { assignmentId: string; name: string; initials: string; pill: Pill; review: boolean }[]
  restCount: number
} {
  const rows: { assignmentId: string; name: string; initials: string; pill: Pill; review: boolean }[] = []
  let restCount = 0
  for (const x of assignees) {
    const pill = studentPill(x.submissionStatus)
    if (pill === null) { restCount++; continue }
    rows.push({
      assignmentId: x.assignmentId, name: x.studentName, initials: initials(x.studentName),
      pill, review: x.submissionStatus === 'submitted',
    })
  }
  return { rows, restCount }
}

export function formsStats(vms: TemplateVM[]): { activeCount: number; done: number; total: number } {
  const active = vms.filter(v => v.status === 'active')
  return {
    activeCount: active.length,
    done: active.reduce((n, v) => n + formDone(v.assignees), 0),
    total: active.reduce((n, v) => n + v.assignees.length, 0),
  }
}

export function docsStats(vms: TemplateVM[]): { docCount: number; reviewCount: number; done: number; total: number } {
  const active = vms.filter(v => v.status === 'active')
  return {
    docCount: vms.length,
    reviewCount: active.reduce((n, v) => n + v.assignees.filter(x => x.submissionStatus === 'submitted').length, 0),
    done: active.reduce((n, v) => n + docDone(v.assignees), 0),
    total: active.reduce((n, v) => n + v.assignees.length, 0),
  }
}

export function earliestActiveDeadline(vms: TemplateVM[]): string | null {
  let earliest: string | null = null
  for (const v of vms) {
    if (v.status !== 'active' || v.deadline === null) continue
    if (earliest === null || v.deadline < earliest) earliest = v.deadline
  }
  return earliest
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/forms/__tests__/rollup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/forms/rollup.ts lib/forms/__tests__/rollup.test.ts
git commit -m "feat(forms): pure rollup derivations for Formulaires/Documents pages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Reminder + checklist emails (`lib/email.ts`)

**Files:**
- Modify: `lib/email.ts`
- Test: `lib/__tests__/email.forms.test.ts`

**Interfaces:**
- Consumes: existing `esc`, `layout`, `getResend`, `logSendError` in `lib/email.ts`.
- Produces:
  - `send()` (module-private) now returns `Promise<boolean>` (true = accepted by Resend or skipped-no-key? **No** — skipped-no-key returns `false`; callers count it as failed only when a key exists. See implementation.)
  - `sendTemplateReminderEmail(opts: { to: string; studentName: string; templateName: string; exchangeName: string; deadline: string | null }): Promise<boolean>`
  - `sendPhase2ChecklistEmail(opts: { to: string; studentName: string; exchangeName: string; items: { name: string; deadline: string | null }[] }): Promise<boolean>`
- French, tutoiement, every interpolation through `esc()`. Dates rendered with `frShortDate` from `@/lib/dashboard/rollup`.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/email.forms.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))

import { sendTemplateReminderEmail, sendPhase2ChecklistEmail } from '@/lib/email'

describe('forms emails', () => {
  beforeEach(() => { sendMock.mockClear(); process.env.RESEND_API_KEY = 'test-key' })

  it('reminder email escapes user content and mentions the deadline', async () => {
    const ok = await sendTemplateReminderEmail({
      to: 's@x.fr', studentName: '<Léa>', templateName: 'Passeport <b>', exchangeName: 'Espagne', deadline: '2026-10-10T00:00:00+00:00',
    })
    expect(ok).toBe(true)
    const call = sendMock.mock.calls[0][0]
    expect(call.to).toBe('s@x.fr')
    expect(call.html).toContain('&lt;Léa&gt;')
    expect(call.html).toContain('Passeport &lt;b&gt;')
    expect(call.html).not.toContain('<Léa>')
    expect(call.html).toContain('10 oct')
    expect(call.subject).toContain('Passeport')
  })

  it('checklist email lists every pending item', async () => {
    await sendPhase2ChecklistEmail({
      to: 's@x.fr', studentName: 'Léa', exchangeName: 'Espagne',
      items: [{ name: 'Passeport', deadline: '2026-10-10T00:00:00+00:00' }, { name: 'AST', deadline: null }],
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.html).toContain('Passeport')
    expect(call.html).toContain('AST')
    expect(call.html).toContain('/my-forms')
  })

  it('returns false when Resend reports an error', async () => {
    sendMock.mockResolvedValueOnce({ error: { name: 'x', statusCode: 500 } })
    const ok = await sendTemplateReminderEmail({
      to: 's@x.fr', studentName: 'Léa', templateName: 'Passeport', exchangeName: 'Espagne', deadline: null,
    })
    expect(ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/__tests__/email.forms.test.ts`
Expected: FAIL — `sendTemplateReminderEmail` is not exported.

- [ ] **Step 3: Implement in `lib/email.ts`**

Change the private `send()` to return a boolean (existing callers ignore the return value — no other changes needed):

```ts
async function send(to: string, subject: string, html: string, label: string): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping ${label}`)
    return false
  }
  const { error } = await resend.emails.send({ from: FROM, to, subject, html })
  if (error) { logSendError(label, error); return false }
  return true
}
```

Append the two new emails (import `frShortDate` at top: `import { frShortDate } from '@/lib/dashboard/rollup'`):

```ts
const STUDENT_FOOTER = 'Tu reçois cet e-mail car ton dossier d’échange scolaire est en cours de préparation sur Eazyexchange.'

export async function sendTemplateReminderEmail(opts: {
  to: string; studentName: string; templateName: string; exchangeName: string; deadline: string | null
}): Promise<boolean> {
  const greeting = opts.studentName ? `Bonjour ${esc(opts.studentName)},` : 'Bonjour,'
  const due = opts.deadline ? ` avant le <strong>${esc(frShortDate(opts.deadline))}</strong>` : ''
  const html = layout(`
    <p>${greeting}</p>
    <p>Il manque encore « <strong>${esc(opts.templateName)}</strong> » à ton dossier pour <strong>${esc(opts.exchangeName)}</strong>. Merci de le compléter${due}.</p>
    <p><a href="${APP_URL}/my-forms" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Compléter mon dossier</a></p>
  `, STUDENT_FOOTER)
  return send(opts.to, `Rappel : ${opts.templateName} — ${opts.exchangeName}`, html, 'template reminder email')
}

export async function sendPhase2ChecklistEmail(opts: {
  to: string; studentName: string; exchangeName: string; items: { name: string; deadline: string | null }[]
}): Promise<boolean> {
  const greeting = opts.studentName ? `Bonjour ${esc(opts.studentName)},` : 'Bonjour,'
  const rows = opts.items.map(i =>
    `<li><strong>${esc(i.name)}</strong>${i.deadline ? ` — échéance ${esc(frShortDate(i.deadline))}` : ''}</li>`
  ).join('')
  const html = layout(`
    <p>${greeting}</p>
    <p>La préparation de <strong>${esc(opts.exchangeName)}</strong> commence ! Voici ce qu’il reste à compléter dans ton dossier :</p>
    <ul>${rows}</ul>
    <p><a href="${APP_URL}/my-forms" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Ouvrir mon dossier</a></p>
  `, STUDENT_FOOTER)
  return send(opts.to, `Ton dossier pour ${opts.exchangeName} — c’est parti !`, html, 'phase-2 checklist email')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/__tests__/email.forms.test.ts lib/__tests__/email.application.test.ts`
Expected: PASS (both new and existing email tests — the `send()` return-type change must not break existing callers).

- [ ] **Step 5: Commit**

```bash
git add lib/email.ts lib/__tests__/email.forms.test.ts
git commit -m "feat(email): French template-reminder + phase-2 checklist emails

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Template lifecycle server actions (`actions/forms.ts`)

**Files:**
- Modify: `actions/forms.ts` (keep existing exports: `createTemplate` can be deleted — its only caller, the old new-form page, becomes a redirect in Task 12; keep `getTemplate`, `addField`, `removeField`, `addSlot`, `removeSlot`)
- Test: `actions/__tests__/forms-phase3.test.ts`

**Interfaces:**
- Consumes: `TemplateVM`, `AssigneeRow` from `@/lib/forms/rollup`; `sendTemplateReminderEmail` from `@/lib/email`; `validateUploadFile`-style constraints (PDF-only here).
- Produces (server actions imported by Tasks 7–11):

```ts
export async function getTemplatesPage(exchangeId: string, family: 'forms' | 'docs'): Promise<{
  templates: TemplateVM[]
  studentCount: number
  enrolledStudents: { id: string; full_name: string }[]
  phase: 1 | 2
  exchangeName: string
}>
export async function createDraftTemplate(formData: FormData): Promise<string> // exchange_id, kind, name, deadline?, audience?, condition_label?, file?
export async function updateTemplateMeta(id: string, meta: { name: string; description: string | null; deadline: string | null; condition_label: string | null }): Promise<void>
export async function replaceTemplateFile(formData: FormData): Promise<void>  // template_id, file
export async function activateTemplate(id: string, studentIds?: string[]): Promise<void>
export async function deleteTemplate(id: string): Promise<void>
export async function remindTemplate(id: string): Promise<{ reminded: number; skipped: number; failed: number }>
```

- [ ] **Step 1: Write the failing tests**

Create `actions/__tests__/forms-phase3.test.ts`. Mock style mirrors `exchange-phase.test.ts` — a switchable `from()` stub per table plus mocked email module:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const reminderMock = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/email', () => ({
  sendTemplateReminderEmail: (...a: unknown[]) => reminderMock(...a),
  sendPhase2ChecklistEmail: vi.fn().mockResolvedValue(true),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ---- switchable state ----
let role = 'organizer'
let template: any
let assignments: any[] = []
let enrolledUsers: any[] = []
let exchange: any = { phase: 1, name: 'Espagne' }
const templateUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
const assignmentInsert = vi.fn().mockResolvedValue({ error: null })
const assignmentUpdate = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) })
const templateDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

const from = vi.fn((table: string) => {
  if (table === 'users') {
    return {
      select: (cols: string) => ({
        eq: () => ({
          single: async () => ({ data: { school_id: 'school-1', role } }),
        }),
        in: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: enrolledUsers }) }) }),
      }),
    }
  }
  if (table === 'form_templates') {
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: template }), maybeSingle: async () => ({ data: template }) }) }),
      update: templateUpdate,
      delete: templateDelete,
    }
  }
  if (table === 'assignments') {
    return {
      select: () => ({ eq: () => Promise.resolve({ data: assignments }) }),
      insert: assignmentInsert,
      update: assignmentUpdate,
    }
  }
  if (table === 'exchanges') {
    return { select: () => ({ eq: () => ({ single: async () => ({ data: exchange }), maybeSingle: async () => ({ data: { school_a_id: 'school-1', school_b_id: 'school-2' } }) }) }) }
  }
  if (table === 'exchange_enrollments') {
    return { select: () => ({ eq: () => Promise.resolve({ data: enrolledUsers.map(u => ({ user_id: u.id })) }) }) }
  }
  return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from,
    storage: { from: () => ({ upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }) }) },
  }),
}))

import { activateTemplate, deleteTemplate, remindTemplate } from '@/actions/forms'

beforeEach(() => {
  vi.clearAllMocks()
  role = 'organizer'
  exchange = { phase: 1, name: 'Espagne' }
  enrolledUsers = []
  assignments = []
  template = {
    id: 'tpl-1', school_id: 'school-1', exchange_id: 'ex-1', name: 'Passeport',
    kind: 'doc', status: 'draft', audience: 'all', deadline: '2026-10-10',
    template_file_path: null, form_fields: [{ id: 'f1' }],
  }
})

describe('activateTemplate', () => {
  it('rejects a draft without deadline', async () => {
    template.deadline = null
    await expect(activateTemplate('tpl-1')).rejects.toThrow(/échéance/i)
    expect(templateUpdate).not.toHaveBeenCalled()
  })
  it('rejects a pdf without file', async () => {
    template.kind = 'pdf'
    await expect(activateTemplate('tpl-1')).rejects.toThrow(/PDF/)
  })
  it('rejects an online form without questions', async () => {
    template.kind = 'online'
    template.form_fields = []
    await expect(activateTemplate('tpl-1')).rejects.toThrow(/question/i)
  })
  it('rejects a conditional doc without chosen students', async () => {
    template.audience = 'conditional'
    await expect(activateTemplate('tpl-1')).rejects.toThrow(/élève/i)
  })
  it('activates an « all » doc and inserts no assignments itself (trigger does it)', async () => {
    await activateTemplate('tpl-1')
    expect(templateUpdate).toHaveBeenCalledWith({ status: 'active' })
    expect(assignmentInsert).not.toHaveBeenCalled()
  })
  it('activates a conditional doc inserting assignments for enrolled choices', async () => {
    template.audience = 'conditional'
    enrolledUsers = [{ id: 'stu-1', full_name: 'Léa' }, { id: 'stu-2', full_name: 'Hugo' }]
    await activateTemplate('tpl-1', ['stu-1'])
    expect(assignmentInsert).toHaveBeenCalledWith([{ template_id: 'tpl-1', student_id: 'stu-1' }])
  })
  it('rejects conditional choices that are not enrolled students', async () => {
    template.audience = 'conditional'
    enrolledUsers = [{ id: 'stu-1', full_name: 'Léa' }]
    await expect(activateTemplate('tpl-1', ['stu-1', 'ghost'])).rejects.toThrow()
  })
  it('non-organizer is rejected', async () => {
    role = 'student'
    await expect(activateTemplate('tpl-1')).rejects.toThrow(/Unauthorized/)
  })
})

describe('deleteTemplate', () => {
  it('refuses standard templates', async () => {
    template.standard_key = 'passeport'
    await expect(deleteTemplate('tpl-1')).rejects.toThrow(/standard/i)
    expect(templateDelete).not.toHaveBeenCalled()
  })
  it('deletes a custom template', async () => {
    template.standard_key = null
    await deleteTemplate('tpl-1')
    expect(templateDelete).toHaveBeenCalled()
  })
})

describe('remindTemplate', () => {
  const HOURS = 3600 * 1000
  it('emails incomplete assignees, skips completed and recently-reminded', async () => {
    template.status = 'active'
    assignments = [
      { id: 'a1', student_id: 's1', last_reminded_at: null, submissions: { status: null }, users: { email: 'a@x.fr', full_name: 'A' } },
      { id: 'a2', student_id: 's2', last_reminded_at: new Date(Date.now() - 2 * HOURS).toISOString(), submissions: { status: 'draft' }, users: { email: 'b@x.fr', full_name: 'B' } },
      { id: 'a3', student_id: 's3', last_reminded_at: new Date(Date.now() - 30 * HOURS).toISOString(), submissions: { status: 'rejected' }, users: { email: 'c@x.fr', full_name: 'C' } },
      { id: 'a4', student_id: 's4', last_reminded_at: null, submissions: { status: 'approved' }, users: { email: 'd@x.fr', full_name: 'D' } },
    ]
    const res = await remindTemplate('tpl-1')
    expect(res).toEqual({ reminded: 2, skipped: 1, failed: 0 })
    expect(reminderMock).toHaveBeenCalledTimes(2)
    expect(assignmentUpdate).toHaveBeenCalled()
  })
  it('counts failures without aborting the batch', async () => {
    template.status = 'active'
    assignments = [
      { id: 'a1', student_id: 's1', last_reminded_at: null, submissions: { status: null }, users: { email: 'a@x.fr', full_name: 'A' } },
      { id: 'a2', student_id: 's2', last_reminded_at: null, submissions: { status: null }, users: { email: 'b@x.fr', full_name: 'B' } },
    ]
    reminderMock.mockResolvedValueOnce(false)
    const res = await remindTemplate('tpl-1')
    expect(res).toEqual({ reminded: 1, skipped: 0, failed: 1 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run actions/__tests__/forms-phase3.test.ts`
Expected: FAIL — `activateTemplate` is not exported.

- [ ] **Step 3: Implement the actions in `actions/forms.ts`**

Delete the now-unused `createTemplate` export. Add imports at the top:

```ts
import type { TemplateVM, AssigneeRow, TemplateKind } from '@/lib/forms/rollup'
import { sendTemplateReminderEmail } from '@/lib/email'
```

Add a shared owned-template fetch (used by activate/delete/remind/update):

```ts
// Fetch a template the caller's school owns (with fields), or throw.
async function getOwnedTemplate(supabase: SupabaseClient, userId: string, templateId: string) {
  const schoolId = await assertOrganizer(supabase, userId)
  const { data: tmpl } = await supabase
    .from('form_templates')
    .select('id, exchange_id, school_id, name, kind, status, audience, deadline, standard_key, condition_label, template_file_path, form_fields(id)')
    .eq('id', templateId)
    .maybeSingle()
  if (!tmpl || tmpl.school_id !== schoolId) throw new Error('Unauthorized')
  return tmpl as any
}
```

Then the actions:

```ts
const PDF_MAX_BYTES = 10 * 1024 * 1024

function requireValidPdf(file: File): void {
  if (file.type !== 'application/pdf') throw new Error('Le fichier doit être un PDF.')
  if (file.size > PDF_MAX_BYTES) throw new Error('Le PDF dépasse 10 Mo.')
}

async function uploadTemplatePdf(supabase: SupabaseClient, schoolId: string, templateId: string, file: File): Promise<string> {
  requireValidPdf(file)
  const path = `${schoolId}/${templateId}.pdf`
  const { error } = await supabase.storage
    .from('form-templates')
    .upload(path, file, { upsert: true, contentType: 'application/pdf' })
  if (error) throw new Error('Le téléversement du PDF a échoué. Réessayez.')
  return path
}

export async function createDraftTemplate(formData: FormData): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const schoolId = await assertOrganizer(supabase, user.id)

  const exchangeId = formData.get('exchange_id') as string
  const kind = formData.get('kind') as TemplateKind
  const name = ((formData.get('name') as string) ?? '').trim()
  const deadline = ((formData.get('deadline') as string) ?? '').trim() || null
  const audience = (formData.get('audience') as string) === 'conditional' ? 'conditional' : 'all'
  const conditionLabel = ((formData.get('condition_label') as string) ?? '').trim() || null
  const file = formData.get('file') as File | null

  if (!['online', 'pdf', 'doc'].includes(kind)) throw new Error('Type de modèle invalide.')
  if (!name) throw new Error('Donnez un nom au modèle.')
  if (audience === 'conditional' && kind !== 'doc') throw new Error('Seules les pièces peuvent être conditionnelles.')
  if (kind === 'pdf') {
    if (!file || file.size === 0) throw new Error('Téléversez le PDF à faire signer.')
    requireValidPdf(file)
  }

  const { data, error } = await supabase.from('form_templates').insert({
    exchange_id: exchangeId,
    school_id: schoolId,
    name,
    description: null,
    type: kind === 'online' ? 'data_entry' : 'document_upload',
    kind,
    status: 'draft',
    audience,
    condition_label: audience === 'conditional' ? conditionLabel : null,
    deadline,
    created_by: user.id,
  }).select('id').single()
  if (error) throw error
  const templateId = data.id as string

  try {
    if (kind !== 'online') {
      const { error: slotError } = await supabase
        .from('document_slots')
        .insert({ template_id: templateId, label: name, description: null, required: true, order: 0 })
      if (slotError) throw slotError
    }
    if (kind === 'pdf' && file) {
      const path = await uploadTemplatePdf(supabase, schoolId, templateId, file)
      const { error: pathError } = await supabase
        .from('form_templates').update({ template_file_path: path }).eq('id', templateId)
      if (pathError) throw pathError
    }
  } catch (err) {
    // Don't leave a half-configured draft behind.
    await supabase.from('form_templates').delete().eq('id', templateId)
    throw err
  }

  revalidatePath(kind === 'doc' ? '/documents' : '/forms')
  return templateId
}

export async function updateTemplateMeta(
  id: string,
  meta: { name: string; description: string | null; deadline: string | null; condition_label: string | null },
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const tmpl = await getOwnedTemplate(supabase, user.id, id)

  const name = meta.name.trim()
  if (!name) throw new Error('Le nom ne peut pas être vide.')
  if (tmpl.status === 'active' && !meta.deadline) throw new Error('Un modèle actif doit garder une échéance.')

  const { error } = await supabase.from('form_templates').update({
    name,
    description: meta.description?.trim() || null,
    deadline: meta.deadline || null,
    condition_label: tmpl.audience === 'conditional' ? (meta.condition_label?.trim() || null) : null,
  }).eq('id', id)
  if (error) throw error
  revalidatePath(tmpl.kind === 'doc' ? '/documents' : '/forms')
}

export async function replaceTemplateFile(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const id = formData.get('template_id') as string
  const file = formData.get('file') as File | null
  const tmpl = await getOwnedTemplate(supabase, user.id, id)
  if (tmpl.kind !== 'pdf') throw new Error('Ce modèle n’a pas de PDF.')
  if (!file || file.size === 0) throw new Error('Choisissez un fichier PDF.')

  const path = await uploadTemplatePdf(supabase, tmpl.school_id, id, file)
  const { error } = await supabase.from('form_templates').update({ template_file_path: path }).eq('id', id)
  if (error) throw error
  revalidatePath('/forms')
}

export async function activateTemplate(id: string, studentIds?: string[]): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const tmpl = await getOwnedTemplate(supabase, user.id, id)
  if (tmpl.status === 'active') return

  if (!tmpl.deadline) throw new Error('Ajoutez une échéance avant d’activer.')
  if (tmpl.kind === 'pdf' && !tmpl.template_file_path) throw new Error('Téléversez le PDF avant d’activer.')
  if (tmpl.kind === 'online' && (tmpl.form_fields ?? []).length === 0) throw new Error('Ajoutez au moins une question avant d’activer.')

  let chosen: string[] = []
  if (tmpl.audience === 'conditional') {
    if (!studentIds || studentIds.length === 0) throw new Error('Choisissez au moins un élève concerné.')
    // Only enrolled students of our school may be targeted.
    const { data: enrollments } = await supabase
      .from('exchange_enrollments').select('user_id').eq('exchange_id', tmpl.exchange_id)
    const enrolledIds = new Set((enrollments ?? []).map((e: any) => e.user_id))
    const { data: validUsers } = await supabase
      .from('users').select('id')
      .in('id', studentIds).eq('school_id', tmpl.school_id).eq('role', 'student')
    const validIds = new Set((validUsers ?? []).map((u: any) => u.id))
    chosen = studentIds.filter(sid => enrolledIds.has(sid) && validIds.has(sid))
    if (chosen.length !== studentIds.length) throw new Error('Sélection invalide : élève non inscrit à cet échange.')
  }

  const { error } = await supabase.from('form_templates').update({ status: 'active' }).eq('id', id)
  if (error) throw error

  if (tmpl.audience === 'conditional' && chosen.length > 0) {
    const { error: insertError } = await supabase
      .from('assignments')
      .insert(chosen.map(sid => ({ template_id: id, student_id: sid })))
    if (insertError) throw insertError
  }

  // Exchange already in Phase 2 → tell the newly assigned students now
  // (otherwise the Phase-2 checklist email / daily cron covers it).
  const { data: exchange } = await supabase
    .from('exchanges').select('phase, name').eq('id', tmpl.exchange_id).single()
  if (exchange?.phase === 2) {
    await notifyIncompleteAssignees(supabase, { ...tmpl, status: 'active' }, exchange.name, 0)
  }

  revalidatePath(tmpl.kind === 'doc' ? '/documents' : '/forms')
}

export async function deleteTemplate(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const tmpl = await getOwnedTemplate(supabase, user.id, id)
  if (tmpl.standard_key) throw new Error('Les modèles standard ne peuvent pas être supprimés.')

  if (tmpl.template_file_path) {
    // Best effort — an orphaned file must not block the delete.
    await supabase.storage.from('form-templates').remove([tmpl.template_file_path])
  }
  const { error } = await supabase.from('form_templates').delete().eq('id', id)
  if (error) throw error
  revalidatePath(tmpl.kind === 'doc' ? '/documents' : '/forms')
}

const REMIND_COOLDOWN_MS = 24 * 3600 * 1000

// Shared by remindTemplate (24 h cooldown) and activateTemplate-in-phase-2
// (cooldownMs = 0: fresh assignments have never been emailed).
async function notifyIncompleteAssignees(
  supabase: SupabaseClient,
  tmpl: { id: string; name: string; deadline: string | null },
  exchangeName: string,
  cooldownMs: number,
): Promise<{ reminded: number; skipped: number; failed: number }> {
  const { data: rows } = await supabase
    .from('assignments')
    .select('id, last_reminded_at, submissions(status), users!assignments_student_id_fkey(email, full_name)')
    .eq('template_id', tmpl.id)
  const cutoff = Date.now() - cooldownMs
  let reminded = 0, skipped = 0, failed = 0
  const remindedIds: string[] = []
  for (const row of (rows ?? []) as any[]) {
    const submission = Array.isArray(row.submissions) ? row.submissions[0] : row.submissions
    const status = submission?.status ?? null
    if (status === 'submitted' || status === 'approved') continue
    if (cooldownMs > 0 && row.last_reminded_at && new Date(row.last_reminded_at).getTime() > cutoff) { skipped++; continue }
    const student = Array.isArray(row.users) ? row.users[0] : row.users
    if (!student?.email) { failed++; continue }
    const ok = await sendTemplateReminderEmail({
      to: student.email, studentName: student.full_name ?? '',
      templateName: tmpl.name, exchangeName, deadline: tmpl.deadline,
    })
    if (ok) { reminded++; remindedIds.push(row.id) } else { failed++ }
  }
  if (remindedIds.length > 0) {
    await supabase.from('assignments')
      .update({ last_reminded_at: new Date().toISOString() })
      .in('id', remindedIds)
  }
  return { reminded, skipped, failed }
}

export async function remindTemplate(id: string): Promise<{ reminded: number; skipped: number; failed: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const tmpl = await getOwnedTemplate(supabase, user.id, id)
  if (tmpl.status !== 'active') throw new Error('Activez le modèle avant de relancer.')
  const { data: exchange } = await supabase
    .from('exchanges').select('name').eq('id', tmpl.exchange_id).single()
  return notifyIncompleteAssignees(supabase, tmpl, exchange?.name ?? '', REMIND_COOLDOWN_MS)
}
```

**Note for the implementer:** the test's `from('assignments').select(...)` stub resolves `.eq()` directly to `{ data: assignments }` — match the query shape above (single `.eq('template_id', …)` after `.select`). If the `users!assignments_student_id_fkey` embed name is wrong at runtime (PostgREST names the FK `assignments_student_id_fkey` per the initial schema), verify against a live query during the live drive; the fallback embed syntax is `users!student_id(email, full_name)`.

Then `getTemplatesPage` (read path — covered by the live drive + view tests rather than unit tests, matching how `getExchangeGrid` is untested):

```ts
export async function getTemplatesPage(exchangeId: string, family: 'forms' | 'docs'): Promise<{
  templates: TemplateVM[]
  studentCount: number
  enrolledStudents: { id: string; full_name: string }[]
  phase: 1 | 2
  exchangeName: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const schoolId = await assertOrganizer(supabase, user.id)

  const { data: exchange } = await supabase
    .from('exchanges').select('name, phase, school_a_id, school_b_id').eq('id', exchangeId).maybeSingle()
  if (!exchange || (exchange.school_a_id !== schoolId && exchange.school_b_id !== schoolId)) {
    throw new Error('Unauthorized')
  }

  const kinds = family === 'forms' ? ['online', 'pdf'] : ['doc']
  const [{ data: templates }, { data: enrollments }] = await Promise.all([
    supabase
      .from('form_templates')
      .select('id, kind, status, audience, name, description, deadline, standard_key, condition_label, template_file_path, form_fields(label, "order")')
      .eq('exchange_id', exchangeId)
      .eq('school_id', schoolId)
      .in('kind', kinds)
      .order('created_at'),
    supabase.from('exchange_enrollments').select('user_id').eq('exchange_id', exchangeId),
  ])

  const enrolledIds = (enrollments ?? []).map((e: any) => e.user_id)
  const enrolledStudents: { id: string; full_name: string }[] = enrolledIds.length > 0
    ? ((await supabase
        .from('users').select('id, full_name')
        .in('id', enrolledIds).eq('school_id', schoolId).eq('role', 'student')
        .order('full_name')).data ?? [])
    : []
  const studentById = new Map(enrolledStudents.map(s => [s.id, s.full_name]))

  const templateIds = (templates ?? []).map((t: any) => t.id)
  const assignments: any[] = templateIds.length > 0
    ? ((await supabase
        .from('assignments')
        .select('id, template_id, student_id, submissions(status)')
        .in('template_id', templateIds)).data ?? [])
    : []

  const byTemplate = new Map<string, AssigneeRow[]>()
  for (const a of assignments) {
    const submission = Array.isArray(a.submissions) ? a.submissions[0] : a.submissions
    const row: AssigneeRow = {
      assignmentId: a.id, studentId: a.student_id,
      studentName: studentById.get(a.student_id) ?? '—',
      submissionStatus: submission?.status ?? null,
    }
    const list = byTemplate.get(a.template_id) ?? []
    list.push(row)
    byTemplate.set(a.template_id, list)
  }

  const vms: TemplateVM[] = (templates ?? []).map((t: any) => ({
    id: t.id, kind: t.kind, status: t.status, audience: t.audience,
    name: t.name, description: t.description, deadline: t.deadline,
    standard_key: t.standard_key, condition_label: t.condition_label,
    template_file_path: t.template_file_path,
    fields: [...(t.form_fields ?? [])].sort((a: any, b: any) => a.order - b.order).map((f: any) => f.label),
    assignees: (byTemplate.get(t.id) ?? []).sort((a, b) => a.studentName.localeCompare(b.studentName)),
  }))

  return {
    templates: vms,
    studentCount: enrolledStudents.length,
    enrolledStudents,
    phase: (exchange.phase ?? 1) as 1 | 2,
    exchangeName: exchange.name,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run actions/__tests__/forms-phase3.test.ts actions/__tests__/forms.test.ts`
Expected: PASS. If `forms.test.ts` covered the deleted `createTemplate`, delete those test cases (the action is gone by design).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` — expected PASS.

```bash
git add actions/forms.ts actions/__tests__/forms-phase3.test.ts actions/__tests__/forms.test.ts
git commit -m "feat(forms): template lifecycle actions — draft/activate/delete/remind/page data

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: One-shot Phase-2 checklist on `setExchangePhase`

**Files:**
- Modify: `actions/exchanges.ts` (setExchangePhase)
- Test: `actions/__tests__/exchange-phase.test.ts` (extend)

**Interfaces:**
- Consumes: `sendPhase2ChecklistEmail` from `@/lib/email` (Task 4); `exchanges.phase2_checklist_sent_at` (Task 1).
- Produces: unchanged signature `setExchangePhase(exchangeId: string, phase: 1 | 2): Promise<void>` — new side effect only.

- [ ] **Step 1: Extend the failing test**

In `actions/__tests__/exchange-phase.test.ts`, mock the email module at the top and extend the `from` stub so `exchanges` also answers a detail lookup, `form_templates`/`assignments`/`exchange_enrollments`/`users` answer list queries, and the update chain records payloads:

```ts
const checklistMock = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/email', () => ({
  sendPhase2ChecklistEmail: (...a: unknown[]) => checklistMock(...a),
  sendTemplateReminderEmail: vi.fn().mockResolvedValue(true),
}))

let checklistSentAt: string | null = null
let activeTemplates: any[] = []
let assignmentRows: any[] = []
let enrolledUsers: any[] = []
```

Replace the `exchanges` branch of `from()` with:

```ts
  return {
    select: (cols: string) => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { school_a_id: 'school-1', school_b_id: 'school-2' } }),
        single: () => Promise.resolve({ data: { name: 'Espagne', phase2_checklist_sent_at: checklistSentAt } }),
      }),
    }),
    update,
  }
```

And add branches:

```ts
  if (table === 'form_templates') {
    return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: activeTemplates }) }) }) }) }
  }
  if (table === 'assignments') {
    return { select: () => ({ in: () => Promise.resolve({ data: assignmentRows }) }) }
  }
  if (table === 'exchange_enrollments') {
    return { select: () => ({ eq: () => Promise.resolve({ data: enrolledUsers.map(u => ({ user_id: u.id })) }) }) }
  }
  if (table === 'users' && /* list lookup */ true) { /* keep the existing single() profile branch AND add: */ }
```

(The `users` stub needs both the existing `.eq().single()` profile shape and a `.in().eq().eq()` list shape returning `{ data: enrolledUsers }` — mirror the dual-shape stub from `actions/__tests__/forms-phase3.test.ts`.)

New test cases:

```ts
  it('sends the checklist once when entering phase 2', async () => {
    checklistSentAt = null
    activeTemplates = [{ id: 't1', name: 'Passeport', deadline: '2026-10-10' }]
    enrolledUsers = [{ id: 's1', full_name: 'Léa', email: 'l@x.fr' }]
    assignmentRows = [{ id: 'a1', template_id: 't1', student_id: 's1', submissions: null }]
    await setExchangePhase('ex-1', 2)
    expect(checklistMock).toHaveBeenCalledTimes(1)
    expect(checklistMock.mock.calls[0][0].items).toEqual([{ name: 'Passeport', deadline: '2026-10-10' }])
    // stamped afterwards
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ phase2_checklist_sent_at: expect.any(String) }))
  })

  it('does not re-send when already stamped', async () => {
    checklistSentAt = '2026-07-01T08:00:00Z'
    await setExchangePhase('ex-1', 2)
    expect(checklistMock).not.toHaveBeenCalled()
  })

  it('skips students with nothing pending', async () => {
    checklistSentAt = null
    activeTemplates = [{ id: 't1', name: 'Passeport', deadline: '2026-10-10' }]
    enrolledUsers = [{ id: 's1', full_name: 'Léa', email: 'l@x.fr' }]
    assignmentRows = [{ id: 'a1', template_id: 't1', student_id: 's1', submissions: { status: 'approved' } }]
    await setExchangePhase('ex-1', 2)
    expect(checklistMock).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run tests to verify the new cases fail**

Run: `pnpm vitest run actions/__tests__/exchange-phase.test.ts`
Expected: new cases FAIL (`checklistMock` never called / stamp never written); existing cases PASS.

- [ ] **Step 3: Implement in `actions/exchanges.ts`**

Add the import:

```ts
import { sendPhase2ChecklistEmail } from '@/lib/email'
```

At the end of `setExchangePhase` (after the phase update succeeds, before `revalidatePath`):

```ts
  if (phase === 2) {
    await sendPhase2ChecklistOnce(supabase, exchangeId, profile.school_id)
  }
```

And the helper below it:

```ts
// One-shot checklist when an exchange first enters Phase 2: each enrolled
// student with pending active items gets ONE email listing them. The
// phase2_checklist_sent_at stamp guarantees toggling 1↔2 never re-spams.
async function sendPhase2ChecklistOnce(supabase: any, exchangeId: string, schoolId: string): Promise<void> {
  const { data: exchange } = await supabase
    .from('exchanges').select('name, phase2_checklist_sent_at').eq('id', exchangeId).single()
  if (!exchange || exchange.phase2_checklist_sent_at) return

  // Both audiences included — conditional docs already carry their chosen
  // assignments, and students without one simply have nothing pending.
  const { data: templates } = await supabase
    .from('form_templates')
    .select('id, name, deadline')
    .eq('exchange_id', exchangeId)
    .eq('school_id', schoolId)
    .eq('status', 'active')

  const templateById = new Map((templates ?? []).map((t: any) => [t.id, t]))
  if (templateById.size === 0) { await stampChecklist(supabase, exchangeId); return }

  const { data: enrollments } = await supabase
    .from('exchange_enrollments').select('user_id').eq('exchange_id', exchangeId)
  const enrolledIds = (enrollments ?? []).map((e: any) => e.user_id)
  const students: any[] = enrolledIds.length > 0
    ? ((await supabase
        .from('users').select('id, full_name, email')
        .in('id', enrolledIds).eq('school_id', schoolId).eq('role', 'student')).data ?? [])
    : []

  const { data: assignments } = await supabase
    .from('assignments')
    .select('id, template_id, student_id, submissions(status)')
    .in('template_id', [...templateById.keys()])

  const pendingByStudent = new Map<string, { name: string; deadline: string | null }[]>()
  for (const a of (assignments ?? []) as any[]) {
    const submission = Array.isArray(a.submissions) ? a.submissions[0] : a.submissions
    const status = submission?.status ?? null
    if (status === 'submitted' || status === 'approved') continue
    const t = templateById.get(a.template_id)
    if (!t) continue
    const list = pendingByStudent.get(a.student_id) ?? []
    list.push({ name: t.name, deadline: t.deadline })
    pendingByStudent.set(a.student_id, list)
  }

  for (const student of students) {
    const items = pendingByStudent.get(student.id)
    if (!items || items.length === 0 || !student.email) continue
    await sendPhase2ChecklistEmail({
      to: student.email, studentName: student.full_name ?? '',
      exchangeName: exchange.name, items,
    })
  }

  await stampChecklist(supabase, exchangeId)
}

async function stampChecklist(supabase: any, exchangeId: string): Promise<void> {
  await supabase.from('exchanges')
    .update({ phase2_checklist_sent_at: new Date().toISOString() })
    .eq('id', exchangeId)
}
```

(The `form_templates` query chains exactly three `.eq()` filters — make the test stub in Step 1 match: `select: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: activeTemplates }) }) }) })`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run actions/__tests__/exchange-phase.test.ts`
Expected: PASS (all cases including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add actions/exchanges.ts actions/__tests__/exchange-phase.test.ts
git commit -m "feat(forms): one-shot phase-2 checklist email on phase switch

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: `/forms` page — FormsView, AddFormPanel, FormDrawer, shared bits

**Files:**
- Create: `app/(organizer)/forms/page.tsx`, `components/forms/FormsView.tsx`, `components/forms/AddFormPanel.tsx`, `components/forms/FormDrawer.tsx`, `components/forms/TemplateIcon.tsx`, `components/forms/StatsCard.tsx`, `components/forms/PageBanner.tsx`
- Modify: `components/shell/ShellUiContext.tsx` (extended context shape + defaults; the shell WIRING lands in Task 11 — defaults keep everything working meanwhile), `actions/forms.ts` (add `getTemplateFileUrl`)
- Test: `components/forms/__tests__/FormsView.test.tsx`

**Interfaces:**
- Consumes: `getTemplatesPage`, `activateTemplate`, `deleteTemplate`, `createDraftTemplate` (Task 5); rollup functions (Task 3); `StatusPill` from `@/components/dashboard/StatusPill`; `frShortDate`, `p` from `@/lib/dashboard/rollup`.
- Produces:
  - `ShellUi` context type: `{ openNewExchange: () => void; listSearch: string; setListSearch: (q: string) => void; addRequestId: number; requestAdd: () => void }` (defaults: noop / `''` / `0`).
  - `FormsView({ exchangeId, templates, studentCount }: { exchangeId: string; templates: TemplateVM[]; studentCount: number })`
  - `TemplateIcon({ kind, className? })`, `StatsCard({ stats, barLabel, done, total })`, `PageBanner({ text })` — reused by Task 9.
  - `getTemplateFileUrl(id: string): Promise<string>` server action (signed URL, 1 h).

- [ ] **Step 1: Extend `components/shell/ShellUiContext.tsx`**

```tsx
'use client'
import { createContext, useContext } from 'react'

export type ShellUi = {
  openNewExchange: () => void
  // Contextual top-bar search (set by the shell on /forms and /documents,
  // consumed by the list views as a client-side filter).
  listSearch: string
  setListSearch: (q: string) => void
  // The top-bar page CTA bumps this counter; list views open their add panel
  // when it changes.
  addRequestId: number
  requestAdd: () => void
}

export const ShellUiContext = createContext<ShellUi>({
  openNewExchange: () => {},
  listSearch: '',
  setListSearch: () => {},
  addRequestId: 0,
  requestAdd: () => {},
})

export const useShellUi = () => useContext(ShellUiContext)
```

`OrganizerShell` still provides only `openNewExchange` — object spread keeps it compiling until Task 11 wires the rest: update its provider value to `{ openNewExchange: () => setNewExchangeOpen(true), listSearch: '', setListSearch: () => {}, addRequestId: 0, requestAdd: () => {} }` for now.

Run: `npx tsc --noEmit` — expected PASS.

- [ ] **Step 2: Add `getTemplateFileUrl` to `actions/forms.ts`**

```ts
export async function getTemplateFileUrl(id: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const tmpl = await getOwnedTemplate(supabase, user.id, id)
  if (!tmpl.template_file_path) throw new Error('Aucun PDF pour ce modèle.')
  const { data, error } = await supabase.storage
    .from('form-templates')
    .createSignedUrl(tmpl.template_file_path, 3600)
  if (error || !data?.signedUrl) throw new Error('Impossible de générer le lien de téléchargement.')
  return data.signedUrl
}
```

- [ ] **Step 3: Write the failing view test**

Create `components/forms/__tests__/FormsView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShellUiContext, type ShellUi } from '@/components/shell/ShellUiContext'
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
const createDraft = vi.fn().mockResolvedValue('new-id')
const activate = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: (...a: unknown[]) => createDraft(...a),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
import { FormsView } from '@/components/forms/FormsView'
import type { TemplateVM } from '@/lib/forms/rollup'

const vm = (over: Partial<TemplateVM>): TemplateVM => ({
  id: 't1', kind: 'pdf', status: 'active', audience: 'all', name: 'Formulaire de santé',
  description: 'Antécédents médicaux.', deadline: '2026-10-10T00:00:00+00:00',
  standard_key: 'sante', condition_label: null, template_file_path: 's1/t1.pdf',
  fields: ['Groupe sanguin'], assignees: [
    { assignmentId: 'a1', studentId: 's1', studentName: 'Léa M', submissionStatus: 'approved' },
    { assignmentId: 'a2', studentId: 's2', studentName: 'Hugo P', submissionStatus: null },
  ],
  ...over,
})

function renderWith(ui: React.ReactElement, shell?: Partial<ShellUi>) {
  const value: ShellUi = {
    openNewExchange: vi.fn(), listSearch: '', setListSearch: vi.fn(),
    addRequestId: 0, requestAdd: vi.fn(), ...shell,
  }
  return render(<ShellUiContext.Provider value={value}>{ui}</ShellUiContext.Provider>)
}

describe('FormsView', () => {
  it('renders cards with type pill, status pill and progress', () => {
    renderWith(<FormsView exchangeId="ex1" templates={[vm({})]} studentCount={2} />)
    expect(screen.getByRole('heading', { name: 'Formulaires' })).toBeInTheDocument()
    expect(screen.getByText('PDF · à signer')).toBeInTheDocument()
    expect(screen.getByText('Actif')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 reçus')).toBeInTheDocument()
    expect(screen.getByText('STANDARD')).toBeInTheDocument()
  })
  it('filters by the shell search and shows the empty-result line', () => {
    renderWith(<FormsView exchangeId="ex1" templates={[vm({})]} studentCount={2} />, { listSearch: 'zzz' })
    expect(screen.queryByText('Formulaire de santé')).toBeNull()
    expect(screen.getByText('Aucun résultat pour « zzz »')).toBeInTheDocument()
  })
  it('opens the add panel and creates an online draft', async () => {
    renderWith(<FormsView exchangeId="ex1" templates={[]} studentCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un formulaire/ }))
    fireEvent.click(screen.getByText('Créer un formulaire en ligne'))
    fireEvent.change(screen.getByLabelText('Nom du formulaire'), { target: { value: 'Mon form' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }))
    await screen.findByRole('button', { name: 'Créer le brouillon' }) // settles
    expect(createDraft).toHaveBeenCalled()
    const fd = createDraft.mock.calls[0][0] as FormData
    expect(fd.get('kind')).toBe('online')
    expect(fd.get('name')).toBe('Mon form')
  })
  it('opens the drawer on Aperçu and activates a valid draft', async () => {
    const draft = vm({ id: 'd1', status: 'draft', kind: 'online', name: 'Brouillon X', fields: ['Q1'], assignees: [], template_file_path: null })
    renderWith(<FormsView exchangeId="ex1" templates={[draft]} studentCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }))
    expect(screen.getByText('Questions du formulaire')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await screen.findByRole('button', { name: 'Activer' })
    expect(activate).toHaveBeenCalledWith('d1', undefined)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run components/forms/__tests__/FormsView.test.tsx`
Expected: FAIL — cannot resolve `@/components/forms/FormsView`.

- [ ] **Step 5: Implement the shared bits**

`components/forms/TemplateIcon.tsx` — the 42px squares from the design (navy for pdf/doc, blue for online):

```tsx
import { cn } from '@/lib/utils'
import type { TemplateKind } from '@/lib/forms/rollup'

// 42px icon square: navy for pdf/doc, brand blue for online (per handoff).
export function TemplateIcon({ kind, className }: { kind: TemplateKind; className?: string }) {
  return (
    <div
      className={cn(
        'flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[11px]',
        kind === 'online' ? 'bg-brand' : 'bg-rail',
        className
      )}
    >
      {kind === 'doc' ? (
        <div className="relative h-[17px] w-4">
          <div className="absolute left-0 top-0 h-3.5 w-[11px] rounded-[2px] border-[1.6px] border-white" />
          <div className="absolute bottom-0 right-0 h-3.5 w-[11px] rounded-[2px] border-[1.6px] border-white bg-rail" />
        </div>
      ) : (
        <div className="flex h-[19px] w-[15px] flex-col justify-center gap-[2px] rounded-[2px] border-[1.6px] border-white px-[3px]">
          <div className="h-[1.6px] bg-white" />
          <div className="h-[1.6px] w-[70%] bg-white" />
          {kind === 'pdf' && <div className="h-[1.6px] bg-white" />}
        </div>
      )}
    </div>
  )
}
```

`components/forms/StatsCard.tsx`:

```tsx
// Top stats strip shared by /forms and /documents: N number stats + a
// progress bar (« Réponses reçues » / « Pièces reçues »).
export function StatsCard({
  stats, barLabel, done, total,
}: {
  stats: { value: string; label: string }[]
  barLabel: string
  done: number
  total: number
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-[26px] rounded-[14px] border bg-card px-6 py-[18px]">
      {stats.map((s, i) => (
        <div key={i} className="flex items-center gap-[26px]">
          {i > 0 && <div className="h-[34px] w-px bg-background" />}
          <div className="flex flex-col gap-1">
            <span className="font-display text-2xl font-bold leading-none text-navy">{s.value}</span>
            <span className="text-[11.5px] font-medium text-muted-foreground">{s.label}</span>
          </div>
        </div>
      ))}
      <div className="ml-auto min-w-[200px] flex-1">
        <div className="mb-[7px] flex items-center justify-between">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-placeholder">{barLabel}</span>
          <span className="text-xs font-medium text-muted-foreground">{done} / {total}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-pill bg-background">
          <div className="h-full rounded-pill bg-brand" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}
```

`components/forms/PageBanner.tsx`:

```tsx
// Navy info banner under the stats strip (automation promise line).
export function PageBanner({ text }: { text: string }) {
  return (
    <div className="mb-[26px] flex items-center gap-3 rounded-xl bg-rail px-[18px] py-3.5">
      <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg bg-white/10 text-[15px] text-white">✉</div>
      <span className="text-[12.5px] leading-[1.45] text-white/75">{text}</span>
    </div>
  )
}
```

- [ ] **Step 6: Implement `components/forms/AddFormPanel.tsx`**

Two tiles → inline creation form (second step). Complete file:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createDraftTemplate } from '@/actions/forms'

type Mode = 'pdf' | 'online'

// Inline dashed add panel per handoff: two tiles; clicking one flips to a
// short form (name, échéance optionnelle, PDF file when needed).
export function AddFormPanel({
  exchangeId, onClose, onCreated,
}: {
  exchangeId: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode | null>(null)
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!mode) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('exchange_id', exchangeId)
      fd.set('kind', mode)
      fd.set('name', name)
      if (deadline) fd.set('deadline', deadline)
      if (mode === 'pdf' && file) fd.set('file', file)
      const id = await createDraftTemplate(fd)
      router.refresh()
      onCreated(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 rounded-[14px] border border-dashed border-frame bg-hoverrow p-[18px]">
      <div className="mb-3.5 flex items-center justify-between">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-tertiary">Ajouter un formulaire</div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="h-[26px] w-[26px] rounded-[7px] border bg-card text-[13px] text-tertiary">✕</button>
      </div>

      {mode === null ? (
        <div className="grid grid-cols-2 gap-3.5">
          <button type="button" onClick={() => setMode('pdf')} className="flex flex-col items-start gap-2.5 rounded-xl border bg-card p-[18px] text-left hover:border-brand">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-rail">
              <div className="flex h-[19px] w-[15px] flex-col justify-center gap-[2px] rounded-[2px] border-[1.6px] border-white px-[3px]"><div className="h-[1.6px] bg-white" /><div className="h-[1.6px] w-[70%] bg-white" /><div className="h-[1.6px] bg-white" /></div>
            </div>
            <div className="font-display text-[15px] font-semibold text-navy">Importer un PDF</div>
            <div className="text-[12.5px] leading-normal text-muted-foreground">Téléversez un document que les familles impriment, signent et renvoient.</div>
            <span className="mt-0.5 rounded-lg bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-navy">Téléverser un PDF</span>
          </button>
          <button type="button" onClick={() => setMode('online')} className="flex flex-col items-start gap-2.5 rounded-xl border bg-card p-[18px] text-left hover:border-brand">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-brand">
              <div className="flex h-[19px] w-[15px] flex-col justify-center gap-[2.5px] rounded-[2px] border-[1.6px] border-white px-[3px]"><div className="h-[1.5px] bg-white" /><div className="h-[1.5px] bg-white" /></div>
            </div>
            <div className="font-display text-[15px] font-semibold text-navy">Créer un formulaire en ligne</div>
            <div className="text-[12.5px] leading-normal text-muted-foreground">Composez vos propres questions — remplies directement dans l’application.</div>
            <span className="mt-0.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white">Composer les questions</span>
          </button>
        </div>
      ) : (
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1">
              <label htmlFor="add-form-name" className="text-[13px] font-semibold text-navy">Nom du formulaire</label>
              <input id="add-form-name" value={name} onChange={(e) => setName(e.target.value)} required
                placeholder={mode === 'pdf' ? 'Autorisation parentale' : 'Questionnaire famille'}
                className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="add-form-deadline" className="text-[13px] font-semibold text-navy">Échéance (facultatif)</label>
              <input id="add-form-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] focus:border-brand focus:outline-none" />
            </div>
          </div>
          {mode === 'pdf' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="add-form-file" className="text-[13px] font-semibold text-navy">PDF à faire signer</label>
              <input id="add-form-file" type="file" accept="application/pdf" required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-[13px] text-muted-foreground" />
            </div>
          )}
          {error && <p className="text-sm text-danger-text">{error}</p>}
          <div className="flex gap-2.5">
            <button type="submit" disabled={busy} className="rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
              {busy ? 'Création…' : 'Créer le brouillon'}
            </button>
            <button type="button" onClick={() => setMode(null)} className="rounded-[9px] px-4 py-2.5 text-[13px] font-semibold text-muted-foreground">Retour</button>
          </div>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Implement `components/forms/FormDrawer.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { TemplateIcon } from './TemplateIcon'
import { typePill, statusPill, type TemplateVM } from '@/lib/forms/rollup'
import { activateTemplate, deleteTemplate, getTemplateFileUrl } from '@/actions/forms'

// Right preview drawer (460px) for a form template, per handoff.
export function FormDrawer({ vm, onClose }: { vm: TemplateVM | null; onClose: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setBusy(false); setError(null) }, [vm])
  useEffect(() => {
    if (!vm) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [vm, onClose])

  if (!vm) return null

  async function run(fn: () => Promise<unknown>, closeAfter = false) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      router.refresh()
      if (closeAfter) onClose()
      else setBusy(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
      setBusy(false)
    }
  }

  async function handleDownload() {
    setError(null)
    try {
      const url = await getTemplateFileUrl(vm!.id)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
  }

  function handleDelete() {
    if (!window.confirm('Supprimer ce modèle ? Les réponses déjà envoyées par les élèves seront définitivement supprimées.')) return
    void run(() => deleteTemplate(vm!.id), true)
  }

  return (
    <div className="fixed inset-0 z-40">
      <div data-testid="drawer-backdrop" onClick={onClose} className="fixed inset-0 bg-rail/30" />
      <div className="absolute right-0 top-0 flex h-full w-[460px] flex-col bg-card shadow-modal animate-[drwIn_.25s_ease-out]">
        <div className="flex flex-none items-start justify-between border-b px-[26px] pb-[18px] pt-6">
          <div className="flex items-center gap-[13px]">
            <TemplateIcon kind={vm.kind} />
            <div>
              <div className="font-display text-lg font-semibold text-navy">{vm.name}</div>
              <div className="mt-[5px] flex items-center gap-[7px]">
                <StatusPill pill={typePill(vm.kind)} />
                <StatusPill pill={statusPill(vm.status)} />
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="h-8 w-8 rounded-lg border bg-card text-base text-muted-foreground">✕</button>
        </div>

        <div className="flex-1 overflow-auto px-[26px] py-[22px]">
          {vm.description && <div className="mb-5 text-[13.5px] leading-relaxed text-muted-foreground">{vm.description}</div>}

          {vm.kind === 'pdf' && (
            <div className="mb-[22px] flex h-[150px] items-center justify-center rounded-xl border bg-[repeating-linear-gradient(45deg,theme(colors.hoverrow.DEFAULT),theme(colors.hoverrow.DEFAULT)_11px,theme(colors.background)_11px,theme(colors.background)_22px)]">
              <span className="rounded-lg border bg-card px-3 py-1.5 font-mono text-[11px] font-medium text-placeholder">modèle PDF · aperçu du document</span>
            </div>
          )}

          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
            {vm.kind === 'pdf' ? 'Champs à renseigner' : 'Questions du formulaire'}
          </div>
          {vm.fields.length > 0 ? (
            <div className="flex flex-col overflow-hidden rounded-xl border">
              {vm.fields.map((label, i) => (
                <div key={i} className="flex items-center gap-[11px] border-b px-3.5 py-[11px] last:border-0">
                  <div className="h-4 w-4 flex-none rounded border-[1.5px] border-frame" />
                  <span className="text-[13px] font-medium text-navy">{label}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-frame bg-hoverrow p-[18px] text-[13px] leading-normal text-muted-foreground">
              Ce formulaire n’a pas encore de champs. Ajoutez vos questions puis activez-le pour l’envoyer aux familles.
            </div>
          )}

          {error && <p className="mt-4 text-sm text-danger-text">{error}</p>}
        </div>

        <div className="flex flex-none gap-2.5 border-t px-[26px] py-4">
          {vm.status === 'draft' && (
            <button type="button" disabled={busy} onClick={() => run(() => activateTemplate(vm.id, undefined))}
              className="flex-1 rounded-[9px] bg-brand py-[11px] text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
              {busy ? 'Activation…' : 'Activer'}
            </button>
          )}
          <Link href={`/forms/${vm.id}`}
            className={`flex-1 rounded-[9px] py-[11px] text-center text-[13px] font-semibold ${vm.status === 'draft' ? 'border border-frame-dashed bg-card text-navy' : 'bg-brand text-white hover:bg-brand-hover'}`}>
            Modifier le modèle
          </Link>
          {vm.kind === 'pdf' && vm.template_file_path && (
            <button type="button" onClick={handleDownload}
              className="flex-1 rounded-[9px] border border-frame-dashed bg-card py-[11px] text-[13px] font-semibold text-navy">
              Télécharger
            </button>
          )}
          {vm.standard_key === null && (
            <button type="button" disabled={busy} onClick={handleDelete}
              className="rounded-[9px] bg-danger px-[15px] py-[11px] text-[13px] font-semibold text-danger-text disabled:opacity-60">
              Supprimer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Implement `components/forms/FormsView.tsx`**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { useShellUi } from '@/components/shell/ShellUiContext'
import { typePill, statusPill, progressLabel, progressPct, formsStats, type TemplateVM } from '@/lib/forms/rollup'
import { p } from '@/lib/dashboard/rollup'
import { TemplateIcon } from './TemplateIcon'
import { StatsCard } from './StatsCard'
import { PageBanner } from './PageBanner'
import { AddFormPanel } from './AddFormPanel'
import { FormDrawer } from './FormDrawer'

export function FormsView({
  exchangeId, templates, studentCount,
}: {
  exchangeId: string
  templates: TemplateVM[]
  studentCount: number
}) {
  const { listSearch, addRequestId } = useShellUi()
  const [showAdd, setShowAdd] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const lastAddRequest = useRef(addRequestId)

  // Top-bar « + Nouveau formulaire » bumps addRequestId → open the panel.
  useEffect(() => {
    if (addRequestId !== lastAddRequest.current) {
      lastAddRequest.current = addRequestId
      setShowAdd(true)
    }
  }, [addRequestId])

  const q = listSearch.trim().toLowerCase()
  const visible = q ? templates.filter(t => t.name.toLowerCase().includes(q)) : templates
  const stats = formsStats(templates)
  const open = openId ? templates.find(t => t.id === openId) ?? null : null

  return (
    <div className="max-w-[1040px]">
      <div className="mb-[22px]">
        <h1 className="mb-[5px] font-display text-[26px] font-bold leading-[1.1] tracking-[-.02em]">Formulaires</h1>
        <p className="text-sm text-muted-foreground">
          Les documents et formulaires que les familles complètent pour valider le dossier de leur enfant. Utilisez les modèles standard ou ajoutez les vôtres.
        </p>
      </div>

      <StatsCard
        stats={[
          { value: String(stats.activeCount), label: `Formulaire${p(stats.activeCount)} actif${p(stats.activeCount)}` },
          { value: String(studentCount), label: 'Élèves concernés' },
          { value: 'Phase 2', label: 'Demandés en' },
        ]}
        barLabel="Réponses reçues" done={stats.done} total={stats.total}
      />
      <PageBanner text="Les formulaires actifs sont envoyés automatiquement aux familles à l’ouverture de la Phase 2, avec relance jusqu’à réception." />

      <div className="mb-3.5 flex items-center justify-between">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
          Vos formulaires · {templates.length}
        </div>
        <button type="button" onClick={() => setShowAdd(s => !s)}
          className="inline-flex items-center gap-[7px] rounded-[9px] border border-frame-dashed bg-card px-[15px] py-[9px] text-[13px] font-semibold text-navy hover:bg-hoverrow">
          <span className="text-[15px] leading-none">+</span> Ajouter un formulaire
        </button>
      </div>

      {showAdd && (
        <AddFormPanel exchangeId={exchangeId} onClose={() => setShowAdd(false)}
          onCreated={(id) => { setShowAdd(false); setOpenId(id) }} />
      )}

      <div className="flex flex-col gap-3">
        {visible.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-5 rounded-[14px] border bg-card px-5 py-[18px]">
            <div className="flex min-w-0 flex-1 gap-[15px]">
              <TemplateIcon kind={t.kind} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-[9px]">
                  <span className="font-display text-base font-semibold text-navy">{t.name}</span>
                  <StatusPill pill={typePill(t.kind)} />
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-placeholder">
                    {t.standard_key ? 'STANDARD' : 'PERSONNALISÉ'}
                  </span>
                </div>
                {t.description && (
                  <div className="mt-[5px] max-w-[520px] text-[13px] leading-normal text-muted-foreground">{t.description}</div>
                )}
              </div>
            </div>
            <div className="flex flex-none items-center gap-[22px]">
              {t.status === 'active' ? (
                <div className="w-[150px]">
                  <div className="mb-1.5 text-right font-mono text-[11px] font-medium text-tertiary">{progressLabel(t)}</div>
                  <div className="h-1.5 overflow-hidden rounded-pill bg-background">
                    <div className="h-full rounded-pill bg-brand" style={{ width: `${progressPct(t)}%` }} />
                  </div>
                </div>
              ) : (
                <span className="w-[150px] text-right text-xs font-medium text-placeholder">{progressLabel(t)}</span>
              )}
              <StatusPill pill={statusPill(t.status)} />
              <div className="flex flex-none gap-2">
                <button type="button" onClick={() => setOpenId(t.id)}
                  className="rounded-lg border border-frame-dashed bg-card px-3.5 py-2 text-[12.5px] font-semibold text-navy hover:bg-hoverrow">
                  Aperçu
                </button>
                <a href={`/forms/${t.id}`}
                  className="rounded-lg bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-navy">
                  Modifier
                </a>
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && q && (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun résultat pour «&nbsp;{listSearch.trim()}&nbsp;»</p>
        )}
      </div>

      <FormDrawer vm={open} onClose={() => setOpenId(null)} />
    </div>
  )
}
```

(The stats third tile is the static design string « Demandés en / Phase 2 » — the page does not pass a phase prop.)

- [ ] **Step 9: Implement `app/(organizer)/forms/page.tsx`**

```tsx
import { cookies } from 'next/headers'
import { getExchanges } from '@/actions/exchanges'
import { getTemplatesPage } from '@/actions/forms'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { FormsView } from '@/components/forms/FormsView'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'

export default async function FormsPage() {
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  const { templates, studentCount } = await getTemplatesPage(active.id, 'forms')
  return <FormsView exchangeId={active.id} templates={templates} studentCount={studentCount} />
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `pnpm vitest run components/forms/__tests__/FormsView.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add components/shell/ShellUiContext.tsx components/shell/OrganizerShell.tsx actions/forms.ts app/\(organizer\)/forms/page.tsx components/forms/
git commit -m "feat(forms): /forms page — list, add panel, preview drawer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Template editor — `/forms/[templateId]`, `/documents/[templateId]`, FormBuilder rewrite

**Files:**
- Create: `app/(organizer)/forms/[templateId]/page.tsx`, `app/(organizer)/documents/[templateId]/page.tsx`, `components/forms/TemplateEditor.tsx`
- Modify: `components/FormBuilder.tsx` (full rewrite: French, tokens, fields-only), `actions/forms.ts` (delete `addSlot`/`removeSlot` — no UI uses them anymore; slots are auto-created)
- Test: `components/forms/__tests__/TemplateEditor.test.tsx`; update `actions/__tests__/forms.test.ts` if it covers `addSlot`/`removeSlot` (delete those cases)

**Interfaces:**
- Consumes: `getTemplate` (existing, selects `*, form_fields(*), document_slots(*)` — the `*` picks up the new columns automatically), `updateTemplateMeta`, `replaceTemplateFile`, `addField`, `removeField`, `getTemplateFileUrl`.
- Produces:
  - `TemplateEditor({ template, backHref, backLabel }: { template: EditorTemplate; backHref: string; backLabel: string })` where `EditorTemplate = FormTemplate & { form_fields: FormField[] }` (import both from `@/types/db`).
  - `FormBuilder({ templateId, mode, fields }: { templateId: string; mode: 'questions' | 'checklist'; fields: FormField[] })` — `questions` shows the field-type select; `checklist` adds plain text labels (paper checklist of a PDF form).

- [ ] **Step 1: Write the failing test**

Create `components/forms/__tests__/TemplateEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const updateMeta = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({
  updateTemplateMeta: (...a: unknown[]) => updateMeta(...a),
  replaceTemplateFile: vi.fn().mockResolvedValue(undefined),
  addField: vi.fn().mockResolvedValue(undefined),
  removeField: vi.fn().mockResolvedValue(undefined),
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
import { TemplateEditor } from '@/components/forms/TemplateEditor'

const base: any = {
  id: 't1', exchange_id: 'ex1', school_id: 's1', name: 'Conditions d’accueil',
  description: 'Composition du foyer.', type: 'data_entry', kind: 'online',
  status: 'draft', audience: 'all', standard_key: 'accueil', condition_label: null,
  template_file_path: null, deadline: null, created_by: 'u1', created_at: '2026-07-03T00:00:00Z',
  form_fields: [{ id: 'f1', template_id: 't1', label: 'Animaux domestiques', field_type: 'text', options: null, required: true, order: 0 }],
}

describe('TemplateEditor', () => {
  it('renders metadata and saves changes', async () => {
    render(<TemplateEditor template={base} backHref="/forms" backLabel="Retour aux formulaires" />)
    expect(screen.getByText('Retour aux formulaires')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Accueil 2026' } })
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-10-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await screen.findByRole('button', { name: 'Enregistrer' })
    expect(updateMeta).toHaveBeenCalledWith('t1', {
      name: 'Accueil 2026', description: 'Composition du foyer.', deadline: '2026-10-10', condition_label: null,
    })
  })
  it('shows the question builder for online templates', () => {
    render(<TemplateEditor template={base} backHref="/forms" backLabel="Retour aux formulaires" />)
    expect(screen.getByText(/Questions du formulaire/)).toBeInTheDocument()
    expect(screen.getByText('Animaux domestiques')).toBeInTheDocument()
  })
  it('shows the PDF replace control for pdf templates', () => {
    render(<TemplateEditor template={{ ...base, kind: 'pdf', type: 'document_upload', template_file_path: 's1/t1.pdf' }} backHref="/forms" backLabel="Retour aux formulaires" />)
    expect(screen.getByText(/Remplacer le PDF/)).toBeInTheDocument()
    expect(screen.getByText(/Champs à renseigner/)).toBeInTheDocument()
  })
  it('shows the condition field only for conditional docs', () => {
    render(<TemplateEditor template={{ ...base, kind: 'doc', type: 'document_upload', audience: 'conditional', condition_label: 'si parents divorcés' }} backHref="/documents" backLabel="Retour aux documents" />)
    expect(screen.getByLabelText('Condition')).toHaveValue('si parents divorcés')
    expect(screen.queryByText(/Questions du formulaire/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/forms/__tests__/TemplateEditor.test.tsx`
Expected: FAIL — cannot resolve `@/components/forms/TemplateEditor`.

- [ ] **Step 3: Rewrite `components/FormBuilder.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addField, removeField } from '@/actions/forms'
import type { FormField, FieldType } from '@/types/db'

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Texte', textarea: 'Texte long', date: 'Date', checkbox: 'Case à cocher', select: 'Choix',
}

// Field list editor. `questions` = online form questions (typed fields);
// `checklist` = informational paper checklist of a PDF form (plain labels).
export function FormBuilder({
  templateId, mode, fields,
}: {
  templateId: string
  mode: 'questions' | 'checklist'
  fields: FormField[]
}) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('text')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try { await fn(); router.refresh() } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setBusy(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    await run(() => addField(templateId, label.trim(), mode === 'questions' ? fieldType : 'text', true))
    setLabel('')
  }

  return (
    <div>
      <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
        {mode === 'questions' ? 'Questions du formulaire' : 'Champs à renseigner (sur papier)'} · {fields.length}
      </div>
      {fields.length > 0 && (
        <div className="mb-4 flex flex-col overflow-hidden rounded-xl border">
          {fields.map(f => (
            <div key={f.id} className="flex items-center justify-between gap-3 border-b px-3.5 py-[11px] last:border-0">
              <span className="text-[13px] font-medium text-navy">
                {f.label}
                {mode === 'questions' && <span className="ml-2 text-placeholder">({FIELD_TYPE_LABELS[f.field_type]})</span>}
              </span>
              <button type="button" disabled={busy} onClick={() => run(() => removeField(f.id))}
                className="text-xs font-semibold text-danger-text disabled:opacity-60">
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2.5">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <label htmlFor="builder-label" className="text-[13px] font-semibold text-navy">
            {mode === 'questions' ? 'Nouvelle question' : 'Nouveau champ'}
          </label>
          <input id="builder-label" value={label} onChange={e => setLabel(e.target.value)}
            placeholder={mode === 'questions' ? 'Personne à prévenir' : 'Signature du représentant légal'}
            className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
        </div>
        {mode === 'questions' && (
          <div className="flex flex-col gap-1">
            <label htmlFor="builder-type" className="text-[13px] font-semibold text-navy">Type</label>
            <select id="builder-type" value={fieldType} onChange={e => setFieldType(e.target.value as FieldType)}
              className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[14px]">
              {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map(t => (
                <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" disabled={busy || !label.trim()}
          className="h-11 rounded-[9px] bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
          Ajouter
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-danger-text">{error}</p>}
    </div>
  )
}
```

Delete `addSlot` and `removeSlot` from `actions/forms.ts` (slots are auto-created at template creation; nothing edits them anymore). If `actions/__tests__/forms.test.ts` has cases for them, delete those cases.

- [ ] **Step 4: Implement `components/forms/TemplateEditor.tsx`**

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { statusPill } from '@/lib/forms/rollup'
import { updateTemplateMeta, replaceTemplateFile, getTemplateFileUrl } from '@/actions/forms'
import { FormBuilder } from '@/components/FormBuilder'
import type { FormTemplate, FormField } from '@/types/db'

export type EditorTemplate = FormTemplate & { form_fields: FormField[] }

// Functional edit surface for a template (no designed reference — token-styled,
// French). Metadata + question/checklist builder + PDF replacement.
export function TemplateEditor({
  template, backHref, backLabel,
}: {
  template: EditorTemplate
  backHref: string
  backLabel: string
}) {
  const router = useRouter()
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description ?? '')
  const [deadline, setDeadline] = useState(template.deadline ? template.deadline.slice(0, 10) : '')
  const [conditionLabel, setConditionLabel] = useState(template.condition_label ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await updateTemplateMeta(template.id, {
        name,
        description: description.trim() || null,
        deadline: deadline || null,
        condition_label: template.audience === 'conditional' ? (conditionLabel.trim() || null) : null,
      })
      router.refresh()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setBusy(false)
  }

  async function handleReplaceFile(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('template_id', template.id)
      fd.set('file', file)
      await replaceTemplateFile(fd)
      router.refresh()
      setFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setBusy(false)
  }

  async function handleDownload() {
    try {
      const url = await getTemplateFileUrl(template.id)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
  }

  const inputCls = 'h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none'

  return (
    <div className="max-w-[720px]">
      <Link href={backHref} className="text-sm text-muted-foreground hover:text-navy">‹ {backLabel}</Link>
      <div className="mb-6 mt-3 flex items-center gap-3">
        <h1 className="font-display text-[26px] font-bold leading-[1.1] tracking-[-.02em]">{template.name}</h1>
        <StatusPill pill={statusPill(template.status as 'draft' | 'active')} />
      </div>

      <form onSubmit={handleSave} className="mb-8 flex flex-col gap-4 rounded-[14px] border bg-card p-5">
        <div className="flex flex-col gap-1">
          <label htmlFor="ed-name" className="text-[13px] font-semibold text-navy">Nom</label>
          <input id="ed-name" value={name} onChange={e => setName(e.target.value)} required className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ed-desc" className="text-[13px] font-semibold text-navy">Description</label>
          <textarea id="ed-desc" value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className="rounded-[10px] border border-frame bg-card p-3 text-[15px] focus:border-brand focus:outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="ed-deadline" className="text-[13px] font-semibold text-navy">Échéance</label>
            <input id="ed-deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputCls} />
          </div>
          {template.audience === 'conditional' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="ed-cond" className="text-[13px] font-semibold text-navy">Condition</label>
              <input id="ed-cond" value={conditionLabel} onChange={e => setConditionLabel(e.target.value)}
                placeholder="si parents divorcés" className={inputCls} />
            </div>
          )}
        </div>
        {error && <p className="text-sm text-danger-text">{error}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy}
            className="self-start rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {saved && <span className="text-[12.5px] text-success-text">Enregistré ✓</span>}
        </div>
      </form>

      {template.kind === 'pdf' && (
        <div className="mb-8 rounded-[14px] border bg-card p-5">
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">Remplacer le PDF</div>
          {template.template_file_path && (
            <button type="button" onClick={handleDownload} className="mb-3 text-sm text-brand underline">
              Télécharger le PDF actuel
            </button>
          )}
          <form onSubmit={handleReplaceFile} className="flex items-end gap-2.5">
            <input type="file" accept="application/pdf" aria-label="Nouveau PDF"
              onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-[13px] text-muted-foreground" />
            <button type="submit" disabled={busy || !file}
              className="rounded-[9px] border border-frame-dashed bg-card px-4 py-2.5 text-[13px] font-semibold text-navy disabled:opacity-60">
              Remplacer
            </button>
          </form>
        </div>
      )}

      {template.kind !== 'doc' && (
        <div className="rounded-[14px] border bg-card p-5">
          <FormBuilder
            templateId={template.id}
            mode={template.kind === 'online' ? 'questions' : 'checklist'}
            fields={[...template.form_fields].sort((a, b) => a.order - b.order)}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Implement the two edit routes**

`app/(organizer)/forms/[templateId]/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getTemplate } from '@/actions/forms'
import { TemplateEditor } from '@/components/forms/TemplateEditor'

export default async function EditFormPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  const template = await getTemplate(templateId)
  if (template.kind === 'doc') redirect(`/documents/${templateId}`)
  return <TemplateEditor template={template} backHref="/forms" backLabel="Retour aux formulaires" />
}
```

`app/(organizer)/documents/[templateId]/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getTemplate } from '@/actions/forms'
import { TemplateEditor } from '@/components/forms/TemplateEditor'

export default async function EditDocumentPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  const template = await getTemplate(templateId)
  if (template.kind !== 'doc') redirect(`/forms/${templateId}`)
  return <TemplateEditor template={template} backHref="/documents" backLabel="Retour aux documents" />
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run components/forms/__tests__/TemplateEditor.test.tsx actions/__tests__/forms.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/FormBuilder.tsx components/forms/TemplateEditor.tsx components/forms/__tests__/TemplateEditor.test.tsx app/\(organizer\)/forms/\[templateId\] app/\(organizer\)/documents/\[templateId\] actions/forms.ts actions/__tests__/forms.test.ts
git commit -m "feat(forms): template editor pages + French fields-only FormBuilder

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: `/documents` page — DocsView, AddDocPanel, DocDrawer

**Files:**
- Create: `app/(organizer)/documents/page.tsx`, `components/documents/DocsView.tsx`, `components/documents/AddDocPanel.tsx`, `components/documents/DocDrawer.tsx`
- Test: `components/documents/__tests__/DocsView.test.tsx`

**Interfaces:**
- Consumes: `getTemplatesPage(exchangeId, 'docs')`, `activateTemplate(id, studentIds?)`, `deleteTemplate`, `remindTemplate`, `createDraftTemplate` (Task 5); rollup functions (Task 3); `TemplateIcon`, `StatsCard`, `PageBanner` (Task 7); `frShortDate`, `p` from `@/lib/dashboard/rollup`.
- Produces: `DocsView({ exchangeId, templates, studentCount, enrolledStudents }: { exchangeId: string; templates: TemplateVM[]; studentCount: number; enrolledStudents: { id: string; full_name: string }[] })`.

- [ ] **Step 1: Write the failing test**

Create `components/documents/__tests__/DocsView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const activate = vi.fn().mockResolvedValue(undefined)
const remind = vi.fn().mockResolvedValue({ reminded: 2, skipped: 1, failed: 0 })
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: vi.fn().mockResolvedValue('new-id'),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
  remindTemplate: (...a: unknown[]) => remind(...a),
}))
import { DocsView } from '@/components/documents/DocsView'
import type { TemplateVM } from '@/lib/forms/rollup'

const doc = (over: Partial<TemplateVM>): TemplateVM => ({
  id: 'd1', kind: 'doc', status: 'active', audience: 'all', name: 'Passeport',
  description: 'Copie du passeport.', deadline: '2026-10-10T00:00:00+00:00',
  standard_key: 'passeport', condition_label: null, template_file_path: null, fields: [],
  assignees: [
    { assignmentId: 'a1', studentId: 's1', studentName: 'Léa Moreau', submissionStatus: 'approved' },
    { assignmentId: 'a2', studentId: 's2', studentName: 'Yanis Benali', submissionStatus: 'submitted' },
    { assignmentId: 'a3', studentId: 's3', studentName: 'Manon Girard', submissionStatus: null },
  ],
  ...over,
})
const students = [{ id: 's1', full_name: 'Léa Moreau' }, { id: 's2', full_name: 'Yanis Benali' }]

describe('DocsView', () => {
  it('renders attention pill and progress', () => {
    render(<DocsView exchangeId="ex1" templates={[doc({})]} studentCount={3} enrolledStudents={students} />)
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument()
    expect(screen.getByText('1 manquant')).toBeInTheDocument()
    expect(screen.getByText('1 / 3 fourni')).toBeInTheDocument()
    expect(screen.getByText('Obligatoire')).toBeInTheDocument()
  })
  it('drawer shows per-student rows, folded rest and review link', () => {
    render(<DocsView exchangeId="ex1" templates={[doc({})]} studentCount={3} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: 'Détail' }))
    expect(screen.getByText('Suivi par élève')).toBeInTheDocument()
    expect(screen.getByText('Yanis Benali')).toBeInTheDocument()
    expect(screen.getByText('+ 1 élève — pièce fournie et validée')).toBeInTheDocument()
    const reviewLink = screen.getByRole('link', { name: /À vérifier/ })
    expect(reviewLink).toHaveAttribute('href', '/exchanges/ex1/submissions/a2')
  })
  it('relance reports the result line', async () => {
    render(<DocsView exchangeId="ex1" templates={[doc({})]} studentCount={3} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: 'Détail' }))
    fireEvent.click(screen.getByRole('button', { name: 'Relancer les familles' }))
    expect(await screen.findByText(/2 relancés/)).toBeInTheDocument()
    expect(remind).toHaveBeenCalledWith('d1')
  })
  it('conditional draft requires picking students, then activates with them', async () => {
    const draft = doc({ id: 'd2', status: 'draft', audience: 'conditional', condition_label: 'si parents divorcés', assignees: [], deadline: '2026-10-10T00:00:00+00:00' })
    render(<DocsView exchangeId="ex1" templates={[draft]} studentCount={3} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: 'Détail' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir les élèves & activer' }))
    // picker visible → choose one student and confirm
    fireEvent.click(screen.getByLabelText('Léa Moreau'))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await screen.findByRole('button', { name: 'Activer' })
    expect(activate).toHaveBeenCalledWith('d2', ['s1'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/documents/__tests__/DocsView.test.tsx`
Expected: FAIL — cannot resolve `@/components/documents/DocsView`.

- [ ] **Step 3: Implement `components/documents/AddDocPanel.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createDraftTemplate } from '@/actions/forms'

type Mode = 'all' | 'conditional'

// Inline dashed add panel: « Obligatoire pour tous » / « Selon la situation »,
// then a short creation form.
export function AddDocPanel({
  exchangeId, onClose, onCreated,
}: {
  exchangeId: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode | null>(null)
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [condition, setCondition] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!mode) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('exchange_id', exchangeId)
      fd.set('kind', 'doc')
      fd.set('name', name)
      fd.set('audience', mode)
      if (deadline) fd.set('deadline', deadline)
      if (mode === 'conditional' && condition) fd.set('condition_label', condition)
      const id = await createDraftTemplate(fd)
      router.refresh()
      onCreated(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 rounded-[14px] border border-dashed border-frame bg-hoverrow p-[18px]">
      <div className="mb-3.5 flex items-center justify-between">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-tertiary">Demander un document</div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="h-[26px] w-[26px] rounded-[7px] border bg-card text-[13px] text-tertiary">✕</button>
      </div>

      {mode === null ? (
        <div className="grid grid-cols-2 gap-3.5">
          <button type="button" onClick={() => setMode('all')} className="flex flex-col items-start gap-2.5 rounded-xl border bg-card p-[18px] text-left hover:border-brand">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-rail">
              <div className="relative h-4 w-[15px]"><div className="absolute left-0 top-0 h-[13px] w-2.5 rounded-[2px] border-[1.6px] border-white" /><div className="absolute bottom-0 right-0 h-[13px] w-2.5 rounded-[2px] border-[1.6px] border-white bg-rail" /></div>
            </div>
            <div className="font-display text-[15px] font-semibold text-navy">Obligatoire pour tous</div>
            <div className="text-[12.5px] leading-normal text-muted-foreground">Demandé à chaque élève confirmé — compte dans la complétude du dossier.</div>
            <span className="mt-0.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white">Ajouter la pièce</span>
          </button>
          <button type="button" onClick={() => setMode('conditional')} className="flex flex-col items-start gap-2.5 rounded-xl border bg-card p-[18px] text-left hover:border-brand">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-muted-foreground font-display text-base font-bold text-white">?</div>
            <div className="font-display text-[15px] font-semibold text-navy">Selon la situation</div>
            <div className="text-[12.5px] leading-normal text-muted-foreground">Demandé uniquement aux élèves concernés — vous choisissez qui, sans pénaliser les autres dossiers.</div>
            <span className="mt-0.5 rounded-lg bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-navy">Ajouter la pièce</span>
          </button>
        </div>
      ) : (
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1">
              <label htmlFor="add-doc-name" className="text-[13px] font-semibold text-navy">Nom de la pièce</label>
              <input id="add-doc-name" value={name} onChange={(e) => setName(e.target.value)} required
                placeholder="Carte européenne d’assurance maladie"
                className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="add-doc-deadline" className="text-[13px] font-semibold text-navy">Échéance (facultatif)</label>
              <input id="add-doc-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] focus:border-brand focus:outline-none" />
            </div>
          </div>
          {mode === 'conditional' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="add-doc-cond" className="text-[13px] font-semibold text-navy">Condition (facultatif)</label>
              <input id="add-doc-cond" value={condition} onChange={(e) => setCondition(e.target.value)}
                placeholder="si parents divorcés"
                className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
            </div>
          )}
          {error && <p className="text-sm text-danger-text">{error}</p>}
          <div className="flex gap-2.5">
            <button type="submit" disabled={busy} className="rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
              {busy ? 'Création…' : 'Créer le brouillon'}
            </button>
            <button type="button" onClick={() => setMode(null)} className="rounded-[9px] px-4 py-2.5 text-[13px] font-semibold text-muted-foreground">Retour</button>
          </div>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Implement `components/documents/DocDrawer.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { TemplateIcon } from '@/components/forms/TemplateIcon'
import { reqPill, progressLabel, docDrawerRows, type TemplateVM } from '@/lib/forms/rollup'
import { frShortDate, p } from '@/lib/dashboard/rollup'
import { activateTemplate, deleteTemplate, remindTemplate } from '@/actions/forms'

// Right detail drawer (460px) for a pièce justificative, per handoff.
export function DocDrawer({
  vm, exchangeId, enrolledStudents, onClose,
}: {
  vm: TemplateVM | null
  exchangeId: string
  enrolledStudents: { id: string; full_name: string }[]
  onClose: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [chosen, setChosen] = useState<string[]>([])
  const [remindResult, setRemindResult] = useState<{ reminded: number; skipped: number; failed: number } | null>(null)

  useEffect(() => {
    setBusy(false); setError(null); setPicking(false); setChosen([]); setRemindResult(null)
  }, [vm])
  useEffect(() => {
    if (!vm) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [vm, onClose])

  if (!vm) return null
  const { rows, restCount } = docDrawerRows(vm.assignees)
  const isDraft = vm.status === 'draft'
  const needsPicker = vm.audience === 'conditional'

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try { await fn(); router.refresh() } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setBusy(false)
  }

  function handleActivate() {
    if (needsPicker && !picking) { setPicking(true); return }
    void run(() => activateTemplate(vm!.id, needsPicker ? chosen : undefined))
  }

  async function handleRemind() {
    setBusy(true)
    setError(null)
    setRemindResult(null)
    try {
      const res = await remindTemplate(vm!.id)
      setRemindResult(res)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setBusy(false)
  }

  function handleDelete() {
    if (!window.confirm('Supprimer cette pièce ? Les fichiers déjà envoyés par les familles seront définitivement supprimés.')) return
    void run(async () => { await deleteTemplate(vm!.id); onClose() })
  }

  return (
    <div className="fixed inset-0 z-40">
      <div data-testid="drawer-backdrop" onClick={onClose} className="fixed inset-0 bg-rail/30" />
      <div className="absolute right-0 top-0 flex h-full w-[460px] flex-col bg-card shadow-modal animate-[drwIn_.25s_ease-out]">
        <div className="flex flex-none items-start justify-between border-b px-[26px] pb-[18px] pt-6">
          <div className="flex items-center gap-[13px]">
            <TemplateIcon kind="doc" className={vm.audience === 'conditional' ? 'bg-muted-foreground' : undefined} />
            <div>
              <div className="font-display text-lg font-semibold text-navy">{vm.name}</div>
              <div className="mt-[5px] flex items-center gap-[7px]">
                <StatusPill pill={reqPill(vm)} />
                <span className="text-xs font-medium text-tertiary">{progressLabel(vm)}</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="h-8 w-8 rounded-lg border bg-card text-base text-muted-foreground">✕</button>
        </div>

        <div className="flex-1 overflow-auto px-[26px] py-[22px]">
          {vm.description && <div className="mb-5 text-[13.5px] leading-relaxed text-muted-foreground">{vm.description}</div>}

          <div className="mb-[22px] flex flex-wrap gap-2">
            <span className="rounded-lg border bg-hoverrow px-[11px] py-1.5 font-mono text-[11.5px] font-medium text-muted-foreground">PDF · JPG · PNG</span>
            <span className="rounded-lg border bg-hoverrow px-[11px] py-1.5 font-mono text-[11.5px] font-medium text-muted-foreground">10 Mo max</span>
            {vm.deadline && (
              <span className="rounded-lg border bg-hoverrow px-[11px] py-1.5 font-mono text-[11.5px] font-medium text-muted-foreground">Échéance {frShortDate(vm.deadline)}</span>
            )}
          </div>

          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">Suivi par élève</div>

          {isDraft && !picking && (
            <div className="rounded-xl border border-dashed border-frame bg-hoverrow p-[18px] text-[13px] leading-normal text-muted-foreground">
              Cette pièce n’a pas encore été demandée. {needsPicker ? 'Choisissez les élèves concernés puis activez-la pour lancer les demandes.' : 'Activez-la pour lancer les demandes.'}
            </div>
          )}

          {isDraft && picking && (
            <div className="flex flex-col overflow-hidden rounded-xl border">
              {enrolledStudents.map(s => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2.5 border-b px-3.5 py-[11px] text-[13px] font-medium text-navy last:border-0 hover:bg-hoverrow-soft">
                  <input type="checkbox" checked={chosen.includes(s.id)} aria-label={s.full_name}
                    onChange={(e) => setChosen(prev => e.target.checked ? [...prev, s.id] : prev.filter(x => x !== s.id))} />
                  {s.full_name}
                </label>
              ))}
              {enrolledStudents.length === 0 && (
                <div className="px-3.5 py-[11px] text-[13px] text-muted-foreground">Aucun élève inscrit pour l’instant.</div>
              )}
            </div>
          )}

          {!isDraft && (rows.length > 0 || restCount > 0) && (
            <div className="flex flex-col overflow-hidden rounded-xl border">
              {rows.map(r => (
                <div key={r.assignmentId} className="flex items-center justify-between gap-[11px] border-b px-3.5 py-[11px] last:border-0">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-background font-mono text-[10px] font-semibold text-muted-foreground">{r.initials}</span>
                    <span className="truncate text-[13px] font-medium text-navy">{r.name}</span>
                  </div>
                  {r.review ? (
                    <Link href={`/exchanges/${exchangeId}/submissions/${r.assignmentId}`} className="hover:opacity-80">
                      <StatusPill pill={r.pill} />
                    </Link>
                  ) : (
                    <StatusPill pill={r.pill} />
                  )}
                </div>
              ))}
              {restCount > 0 && (
                <div className="bg-hoverrow-soft px-3.5 py-[11px] text-xs font-medium text-tertiary">
                  + {restCount} élève{p(restCount)} — pièce fournie et validée
                </div>
              )}
            </div>
          )}

          {remindResult && (
            <p className={`mt-4 text-sm ${remindResult.failed > 0 ? 'text-danger-text' : 'text-success-text'}`}>
              {remindResult.reminded} relancé{p(remindResult.reminded)}
              {remindResult.skipped > 0 ? ` · ${remindResult.skipped} déjà relancé${p(remindResult.skipped)} récemment` : ''}
              {remindResult.failed > 0 ? ` · ${remindResult.failed} en échec` : ''}
            </p>
          )}
          {error && <p className="mt-4 text-sm text-danger-text">{error}</p>}
        </div>

        <div className="flex flex-none gap-2.5 border-t px-[26px] py-4">
          {isDraft ? (
            <button type="button" disabled={busy || (picking && chosen.length === 0)} onClick={handleActivate}
              className="flex-1 rounded-[9px] bg-brand py-[11px] text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
              {busy ? 'Activation…' : picking ? 'Activer' : needsPicker ? 'Choisir les élèves & activer' : 'Activer'}
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={handleRemind}
              className="flex-1 rounded-[9px] bg-brand py-[11px] text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
              {busy ? 'Envoi…' : 'Relancer les familles'}
            </button>
          )}
          <Link href={`/documents/${vm.id}`}
            className="flex-1 rounded-[9px] border border-frame-dashed bg-card py-[11px] text-center text-[13px] font-semibold text-navy">
            Modifier
          </Link>
          {vm.standard_key === null && (
            <button type="button" disabled={busy} onClick={handleDelete}
              className="rounded-[9px] bg-danger px-[15px] py-[11px] text-[13px] font-semibold text-danger-text disabled:opacity-60">
              Supprimer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Implement `components/documents/DocsView.tsx`**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { useShellUi } from '@/components/shell/ShellUiContext'
import { reqPill, progressLabel, progressPct, docAttentionPill, docsStats, earliestActiveDeadline, type TemplateVM } from '@/lib/forms/rollup'
import { frShortDate } from '@/lib/dashboard/rollup'
import { TemplateIcon } from '@/components/forms/TemplateIcon'
import { StatsCard } from '@/components/forms/StatsCard'
import { PageBanner } from '@/components/forms/PageBanner'
import { AddDocPanel } from './AddDocPanel'
import { DocDrawer } from './DocDrawer'

export function DocsView({
  exchangeId, templates, studentCount, enrolledStudents,
}: {
  exchangeId: string
  templates: TemplateVM[]
  studentCount: number
  enrolledStudents: { id: string; full_name: string }[]
}) {
  const { listSearch, addRequestId } = useShellUi()
  const [showAdd, setShowAdd] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const lastAddRequest = useRef(addRequestId)

  useEffect(() => {
    if (addRequestId !== lastAddRequest.current) {
      lastAddRequest.current = addRequestId
      setShowAdd(true)
    }
  }, [addRequestId])

  const q = listSearch.trim().toLowerCase()
  const visible = q ? templates.filter(t => t.name.toLowerCase().includes(q)) : templates
  const stats = docsStats(templates)
  const open = openId ? templates.find(t => t.id === openId) ?? null : null
  const due = earliestActiveDeadline(templates)

  return (
    <div className="max-w-[1040px]">
      <div className="mb-[22px]">
        <h1 className="mb-[5px] font-display text-[26px] font-bold leading-[1.1] tracking-[-.02em]">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Les pièces justificatives que les familles téléversent pour compléter le dossier. Utilisez la liste standard ou demandez les vôtres.
        </p>
      </div>

      <StatsCard
        stats={[
          { value: String(stats.docCount), label: 'Documents demandés' },
          { value: String(studentCount), label: 'Élèves concernés' },
          { value: String(stats.reviewCount), label: 'Pièces à vérifier' },
        ]}
        barLabel="Pièces reçues" done={stats.done} total={stats.total}
      />
      <PageBanner text={`Chaque pièce téléversée est mise en file de vérification. Les familles sont relancées automatiquement pour les pièces manquantes${due ? ` jusqu’à l’échéance du ${frShortDate(due)}` : ''}.`} />

      <div className="mb-3.5 flex items-center justify-between">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
          Pièces demandées · {templates.length}
        </div>
        <button type="button" onClick={() => setShowAdd(s => !s)}
          className="inline-flex items-center gap-[7px] rounded-[9px] border border-frame-dashed bg-card px-[15px] py-[9px] text-[13px] font-semibold text-navy hover:bg-hoverrow">
          <span className="text-[15px] leading-none">+</span> Demander un document
        </button>
      </div>

      {showAdd && (
        <AddDocPanel exchangeId={exchangeId} onClose={() => setShowAdd(false)}
          onCreated={(id) => { setShowAdd(false); setOpenId(id) }} />
      )}

      <div className="flex flex-col gap-3">
        {visible.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-5 rounded-[14px] border bg-card px-5 py-[18px]">
            <div className="flex min-w-0 flex-1 items-center gap-[15px]">
              <TemplateIcon kind="doc" className={t.audience === 'conditional' ? 'bg-muted-foreground' : undefined} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-[9px]">
                  <span className="font-display text-base font-semibold text-navy">{t.name}</span>
                  <StatusPill pill={reqPill(t)} />
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-placeholder">
                    {t.standard_key ? 'STANDARD' : 'PERSONNALISÉ'}
                  </span>
                </div>
                {t.description && (
                  <div className="mt-[5px] max-w-[520px] text-[13px] leading-normal text-muted-foreground">{t.description}</div>
                )}
              </div>
            </div>
            <div className="flex flex-none items-center gap-[22px]">
              <div className="w-[150px]">
                <div className="mb-1.5 text-right font-mono text-[11px] font-medium text-tertiary">{progressLabel(t)}</div>
                <div className="h-1.5 overflow-hidden rounded-pill bg-background">
                  <div className="h-full rounded-pill bg-brand" style={{ width: `${progressPct(t)}%` }} />
                </div>
              </div>
              <StatusPill pill={docAttentionPill(t)} />
              <div className="flex flex-none gap-2">
                <button type="button" onClick={() => setOpenId(t.id)}
                  className="rounded-lg border border-frame-dashed bg-card px-3.5 py-2 text-[12.5px] font-semibold text-navy hover:bg-hoverrow">
                  Détail
                </button>
                <a href={`/documents/${t.id}`}
                  className="rounded-lg bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-navy">
                  Modifier
                </a>
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && q && (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun résultat pour «&nbsp;{listSearch.trim()}&nbsp;»</p>
        )}
      </div>

      <DocDrawer vm={open} exchangeId={exchangeId} enrolledStudents={enrolledStudents} onClose={() => setOpenId(null)} />
    </div>
  )
}
```

- [ ] **Step 6: Implement `app/(organizer)/documents/page.tsx`**

```tsx
import { cookies } from 'next/headers'
import { getExchanges } from '@/actions/exchanges'
import { getTemplatesPage } from '@/actions/forms'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { DocsView } from '@/components/documents/DocsView'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'

export default async function DocumentsPage() {
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  const { templates, studentCount, enrolledStudents } = await getTemplatesPage(active.id, 'docs')
  return (
    <DocsView exchangeId={active.id} templates={templates}
      studentCount={studentCount} enrolledStudents={enrolledStudents} />
  )
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm vitest run components/documents/__tests__/DocsView.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/\(organizer\)/documents/page.tsx components/documents/
git commit -m "feat(docs): /documents page — pièces list, add panel, per-student drawer, relance

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Shell — rail items + contextual top bar

**Files:**
- Modify: `components/shell/OrganizerShell.tsx`, `components/shell/RailIcons.tsx`
- Test: `components/shell/__tests__/OrganizerShell.test.tsx` (extend)

**Interfaces:**
- Consumes: `ShellUi` context shape from Task 7.
- Produces: rail items **Formul.** → `/forms`, **Docs** → `/documents` (visible only with an active exchange, like Candid.); top bar shows, on `/forms` and `/documents`, a search input (placeholder « Rechercher un formulaire… » / « Rechercher un document… ») + the page CTA (« + Nouveau formulaire » / « Demander un document ») instead of « + Inviter des élèves »; `listSearch` resets on route change; the CTA bumps `addRequestId`.

- [ ] **Step 1: Extend the failing shell test**

Add to `components/shell/__tests__/OrganizerShell.test.tsx` (reuse the file's existing render helpers/mocks; `usePathname` is already mocked — make it switchable if it isn't):

```tsx
  it('shows Formul. and Docs rail items when an exchange is active', () => {
    renderShell({ pathname: '/dashboard' }) // adapt to the file's helper
    expect(screen.getByText('Formul.')).toBeInTheDocument()
    expect(screen.getByText('Docs')).toBeInTheDocument()
    expect(screen.getByText('Formul.').closest('a')).toHaveAttribute('href', '/forms')
    expect(screen.getByText('Docs').closest('a')).toHaveAttribute('href', '/documents')
  })

  it('shows the contextual search + CTA on /forms instead of the invite button', () => {
    renderShell({ pathname: '/forms' })
    expect(screen.getByPlaceholderText('Rechercher un formulaire…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nouveau formulaire/ })).toBeInTheDocument()
    expect(screen.queryByText(/Inviter des élèves/)).toBeNull()
  })

  it('shows the documents CTA on /documents', () => {
    renderShell({ pathname: '/documents' })
    expect(screen.getByPlaceholderText('Rechercher un document…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Demander un document/ })).toBeInTheDocument()
  })

  it('keeps the invite button elsewhere', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.getByText(/Inviter des élèves/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Rechercher/)).toBeNull()
  })
```

- [ ] **Step 2: Run test to verify the new cases fail**

Run: `pnpm vitest run components/shell/__tests__/OrganizerShell.test.tsx`
Expected: new cases FAIL (no Formul./Docs items, no search input); existing cases PASS.

- [ ] **Step 3: Add the rail icons**

Append to `components/shell/RailIcons.tsx` (same stroke-div style as the existing icons — geometry from the handoff rail):

```tsx
export function IconForms() {
  return (
    <div className="flex h-[17px] w-3.5 flex-col justify-center gap-[2.5px] rounded-[2px] border-[1.5px] border-current px-[3px]">
      <div className="h-[5px] w-[5px] rounded-[1px] border-[1.5px] border-current" />
      <div className="h-[1.5px] w-[80%] bg-current" />
    </div>
  )
}

export function IconDocs() {
  return (
    <div className="relative h-[17px] w-4">
      <div className="absolute left-0 top-0 h-3.5 w-[11px] rounded-[2px] border-[1.5px] border-current" />
      <div className="absolute bottom-0 right-0 h-3.5 w-[11px] rounded-[2px] border-[1.5px] border-current bg-rail" />
    </div>
  )
}
```

- [ ] **Step 4: Wire `OrganizerShell.tsx`**

Imports: add `IconForms, IconDocs` to the RailIcons import and `useMemo` to the React import. Import `type ShellUi` from `./ShellUiContext`.

Rail (inside the existing `{active && (…)}` group, after the Candid. item):

```tsx
          {active && (
            <>
              <RailItem href="/applications" label="Candid." active={pathname.startsWith('/applications')}>
                <IconApplications />
              </RailItem>
              <RailItem href="/forms" label="Formul." active={pathname.startsWith('/forms')}>
                <IconForms />
              </RailItem>
              <RailItem href="/documents" label="Docs" active={pathname.startsWith('/documents')}>
                <IconDocs />
              </RailItem>
            </>
          )}
```

State + context value (inside the component, near the other state):

```tsx
  const [listSearch, setListSearch] = useState('')
  const [addRequestId, setAddRequestId] = useState(0)

  // Contextual search is page-scoped: leaving the page clears it.
  useEffect(() => { setListSearch('') }, [pathname])

  const listPage = pathname.startsWith('/forms') ? 'forms'
    : pathname.startsWith('/documents') ? 'docs' : null

  const shellUi = useMemo<ShellUi>(() => ({
    openNewExchange: () => setNewExchangeOpen(true),
    listSearch,
    setListSearch,
    addRequestId,
    requestAdd: () => setAddRequestId(n => n + 1),
  }), [listSearch, addRequestId])
```

Replace the provider value: `<ShellUiContext.Provider value={shellUi}>`.

Top-bar right side — replace the current `{active && (<Link …Inviter des élèves…</Link>)}` block with:

```tsx
          {active && listPage === null && (
            <Link
              href={`/exchanges/${active.id}#invite`}
              className="flex h-[38px] items-center gap-1.5 rounded-[9px] bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-hover"
            >
              <span className="text-base leading-none">+</span> Inviter des élèves
            </Link>
          )}
          {active && listPage !== null && (
            <div className="flex items-center gap-3">
              <input
                type="search"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder={listPage === 'forms' ? 'Rechercher un formulaire…' : 'Rechercher un document…'}
                className="h-[38px] w-[220px] rounded-[9px] border bg-hoverrow px-3.5 text-[13px] placeholder:text-placeholder focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                onClick={shellUi.requestAdd}
                className="flex h-[38px] items-center gap-1.5 rounded-[9px] bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-hover"
              >
                <span className="text-base leading-none">+</span> {listPage === 'forms' ? 'Nouveau formulaire' : 'Demander un document'}
              </button>
            </div>
          )}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run components/shell && npx tsc --noEmit`
Expected: PASS (all shell tests, old and new).

- [ ] **Step 6: Commit**

```bash
git add components/shell/
git commit -m "feat(shell): Formul./Docs rail items + contextual top-bar search and CTA

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Old-route transition — redirects + slim exchange page

**Files:**
- Modify: `app/(organizer)/exchanges/[id]/page.tsx` (slim), `app/(organizer)/exchanges/[id]/forms/new/page.tsx` (redirect stub), `app/(organizer)/exchanges/[id]/forms/[formId]/page.tsx` (redirect stub)
- Keep: `actions/exchanges.ts#getExchangeGrid` (still consumed by `/dashboard` — do NOT delete), `app/(organizer)/exchanges/[id]/submissions/[assignmentId]/page.tsx` (review page stays until Phase 4)

**Interfaces:**
- Consumes: existing `getExchange`, `listApplications`, `ApplicationsCard`.
- Produces: `/exchanges/[id]` = header + invite card only; `/exchanges/[id]/forms/new` → `/forms`; `/exchanges/[id]/forms/[formId]` → `/forms/[formId]`.

- [ ] **Step 1: Replace the redirect stubs**

`app/(organizer)/exchanges/[id]/forms/new/page.tsx` (entire file):

```tsx
import { redirect } from 'next/navigation'

// Phase 3: form creation moved to the session-scoped /forms page.
export default function LegacyNewFormPage() {
  redirect('/forms')
}
```

`app/(organizer)/exchanges/[id]/forms/[formId]/page.tsx` (entire file):

```tsx
import { redirect } from 'next/navigation'

// Phase 3: the form builder moved to /forms/[templateId]. A redirect cannot
// set the session cookie — same accepted transition behavior as Phase 2.
export default async function LegacyFormBuilderPage({
  params,
}: {
  params: Promise<{ id: string; formId: string }>
}) {
  const { formId } = await params
  redirect(`/forms/${formId}`)
}
```

- [ ] **Step 2: Slim `app/(organizer)/exchanges/[id]/page.tsx`**

Entire file becomes:

```tsx
import { getExchange } from '@/actions/exchanges'
import { listApplications } from '@/actions/applications'
import { ApplicationsCard } from '@/components/ApplicationsCard'

// Phase 3: forms/docs management lives on /forms and /documents. This page
// remains the invite / apply-link home (the top bar's « + Inviter des élèves »
// anchors to #invite) until the Élèves phase.
export default async function ExchangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [exchange, applications] = await Promise.all([
    getExchange(id),
    listApplications(id),
  ])
  const counts = {
    submitted: applications.filter((a: { status: string }) => ['submitted', 'accepted', 'declined', 'maybe', 'enrolled', 'rejected'].includes(a.status)).length,
    toReview: applications.filter((a: { status: string }) => a.status === 'submitted').length,
    accepted: applications.filter((a: { status: string }) => ['accepted', 'maybe', 'enrolled'].includes(a.status)).length,
  }

  return (
    <div>
      <div className="mb-6">
        <p className="mb-1 text-sm text-muted-foreground">
          {exchange.school_a?.name} ↔ {exchange.school_b?.name} · {exchange.year}
        </p>
        <h1 className="font-display text-2xl font-semibold">{exchange.name}</h1>
      </div>

      <div id="invite">
        <ApplicationsCard
          exchangeId={id}
          applySlug={exchange.apply_slug}
          open={exchange.application_open}
          deadline={exchange.application_deadline}
          counts={counts}
        />
      </div>
    </div>
  )
}
```

(The old file's `counts.submitted` filter listed `enrolled` but not `enrolling` — keep the existing behavior verbatim as above; not this task's bug to fix.)

- [ ] **Step 3: Verify nothing references the deleted UI**

Run: `grep -rn "forms/new" app components --include='*.tsx' | grep -v "(organizer)/exchanges"`
Expected: no hits (nothing else links to the old builder).
Run: `pnpm vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/\(organizer\)/exchanges/\[id\]
git commit -m "feat(forms): retire legacy forms routes — redirects + slimmed exchange page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Student download link for PDF forms

**Files:**
- Modify: `actions/submissions.ts` (getAssignmentDetails template select), `app/(student)/my-forms/[assignmentId]/page.tsx`

**Interfaces:**
- Consumes: `form-templates` bucket + student read policy (Task 1).
- Produces: on a `kind='pdf'` assignment page, a « Télécharger le document à signer » link (1 h signed URL) above the upload slot.

- [ ] **Step 1: Extend `getAssignmentDetails`**

In `actions/submissions.ts`, find `getAssignmentDetails` and check the template select: if it selects specific columns, add `kind, template_file_path`; if it selects `*`, nothing to change. (The student RLS policy `students read assigned templates` already exposes the row.)

- [ ] **Step 2: Add the link to `app/(student)/my-forms/[assignmentId]/page.tsx`**

Add the import:

```tsx
import { createClient } from '@/lib/supabase/server'
```

After the `getAssignmentDetails` call:

```tsx
  // PDF-to-sign templates: the family downloads the organizer's PDF, prints,
  // signs, and uploads it back into the slot below.
  let templatePdfUrl: string | null = null
  if (template.kind === 'pdf' && template.template_file_path) {
    const supabase = await createClient()
    const { data } = await supabase.storage
      .from('form-templates')
      .createSignedUrl(template.template_file_path, 3600)
    templatePdfUrl = data?.signedUrl ?? null
  }
```

And in the JSX, directly above the `{template.type === 'document_upload' && (…)}` block:

```tsx
      {templatePdfUrl && (
        <p className="mb-6">
          <a
            href={templatePdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-[9px] border border-frame-dashed bg-card px-4 py-2.5 text-[13px] font-semibold text-navy hover:bg-hoverrow"
          >
            ⬇ Télécharger le document à signer
          </a>
        </p>
      )}
```

- [ ] **Step 3: Verify**

Run: `pnpm vitest run && npx tsc --noEmit`
Expected: PASS (no dedicated unit test — this is exercised in the Task 13 live drive PDF round-trip).

- [ ] **Step 4: Commit**

```bash
git add actions/submissions.ts app/\(student\)/my-forms/\[assignmentId\]/page.tsx
git commit -m "feat(student): download link for PDF-to-sign templates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Full gates + live drive + merge protocol

**Files:** none (verification only)

- [ ] **Step 1: Full gates**

Run each and confirm clean output:

```bash
pnpm lint
pnpm test
npx tsc --noEmit
```

Expected: zero errors/warnings introduced by this branch.

- [ ] **Step 2: Confirm the migration is applied**

`supabase migration list` must show `20260703000001` remote (it was pushed in Task 1). If not: `supabase db push` (IPv4 pooler fallback per memory).

- [ ] **Step 3: Live drive (headless session-cookie method from Phase 1 verification, or real browser)**

With `pnpm dev` running and a logged-in organizer session:

1. `/forms` — standard items listed (santé/décharge/photo as `PDF · à signer`, Conditions d'accueil as `Formulaire en ligne`), all « Brouillon », STANDARD tags; stats card + navy banner render.
2. `/documents` — 6 standard pièces (livret + médical showing their condition pills), « Pas encore demandé ».
3. Add a custom online form via the top-bar CTA → panel → « Créer le brouillon » → drawer opens; add one question at `/forms/[id]`; « Activer » from the drawer → becomes Actif; verify assignments appeared for enrolled students (drawer of a doc shows rows; for the form check `X / Y reçus` total).
4. Add a conditional pièce → « Choisir les élèves & activer » with one student → active with 1 assignee.
5. PDF round-trip: create a PDF form with a real small PDF → activate (needs a deadline) → open the student's `/my-forms/[assignmentId]` as the student → « Télécharger le document à signer » works → upload a file back → organizer sees « 1 / N » progress move.
6. « Relancer les familles » on an active pièce with missing uploads → result line « N relancé(s)… » (check Resend dashboard or the local RESEND_API_KEY-unset warning path).
7. Phase switch: set the exchange to Phase 2 from the dashboard stepper → checklist emails logged/sent once; flipping back to 1 and again to 2 sends nothing (stamp).
8. Old routes: `/exchanges/[id]/forms/new` → `/forms`; `/exchanges/[id]` shows only header + invite card; rail shows Formul./Docs; search field filters both lists; `?` no PII in server logs.

Fix anything found; re-run gates.

- [ ] **Step 4: Merge (requires user confirmation — production deploy)**

Present the diff summary and live-drive results to the user, then on their explicit approval:

```bash
git checkout main && git pull
git merge --no-ff redesign/phase-3-forms-docs
pnpm lint && pnpm test && npx tsc --noEmit
git push origin main
```

Update the memory file `project_redesign_phases.md` (Phase 3 → DONE + follow-ups) after the deploy.
