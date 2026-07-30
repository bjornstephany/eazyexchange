# Application template editor — design

**Date:** 2026-07-29
**Status:** approved, ready for planning

## Problem

The student application questionnaire is identical for every school and every
exchange. `lib/application-form.ts` hardcodes four sections and 54 fields;
`messages/{en,fr,es,it,de}.json` hold their labels. An organizer who does not
care about pets, or who needs to ask whether the student can swim, has no
recourse.

Organizers should control the questionnaire used by their exchange: pick a
template, then add and remove questions.

## Scope

**In:** a per-exchange questionnaire, resolved from a code-defined library
template, editable by adding and removing questions inside the four fixed
sections; a cross-school bank of organizer-written questions resurfaced as
one-click suggestions.

**Out:** reordering questions; editing built-in labels or their required-ness;
adding, removing or renaming sections; saving a whole questionnaire back to a
library; uploading a custom application document; the « Changer de modèle »
picker (it arrives with the second built-in template).

## Decisions

| Question | Decision |
|---|---|
| What owns a questionnaire | A reusable library of templates; assigning one to an exchange gives that exchange its **own copy**, so editing never reaches a running campaign |
| Custom question labels | Monolingual — shown exactly as typed, in every locale. Built-in questions keep their five translations |
| Editable structure | Questions only. The four sections are fixed and always present |
| Template edits vs. live applications | The questionnaire **locks permanently at the first application**. No snapshots, no divergence, no answer can become unreadable |
| Question types offered | Texte court, Texte long, Date, Oui/Non, Choix multiple — each with an « obligatoire » toggle |
| Photo | Removable like any other question |
| How the library grows | Not by organizer-saved templates. Individual custom questions are banked and suggested across schools |

## Data model

### `exchanges.application_fields jsonb` (nullable)

`null` means « never customized »: the funnel renders today's
`APPLICATION_SECTIONS` unchanged. Every existing exchange keeps working with no
backfill.

```jsonc
{ "version": 1, "sections": [
    { "id": "student", "fields": [
        { "ref": "last_name" },                  // built-in: id only
        { "ref": "photo" },                      // the photo is a pseudo-field
        { "id": "c_7f3a", "type": "textarea",    // custom: full definition
          "label": "Sait nager ?", "required": true, "maxLength": 150 }
    ]},
    { "id": "parents", "fields": [ … ] },
    { "id": "hosting", "fields": [ … ] },
    { "id": "profile", "fields": [ … ] } ] }
```

Built-in questions are stored **by reference**. Their type, label and
translations keep coming from `lib/application-form.ts` and the message
catalogs, so all five languages keep working and later copy fixes still reach
every exchange. Custom questions carry their whole definition inline with the
single label the organizer typed.

The photo is represented as the pseudo-field `photo` in the student section —
the id `missingRequiredApplication()` already uses — so removing it is simply
absence from the list.

### `resolveApplicationSections(applicationFields)`

Returns the existing `AppSection[]` shape. Built-in refs resolve against
`APPLICATION_SECTIONS`; unknown refs (a built-in later deleted from code) are
skipped rather than throwing. `null` returns `APPLICATION_SECTIONS` verbatim.

This single resolver is what keeps the change small: the funnel form, the
organizer read view and the PDF recap keep their current structure and only
change where their sections come from.

### `application_custom_questions`

| column | notes |
|---|---|
| `id` | pk |
| `school_id` | fk schools |
| `normalized_label` | lowercased, trimmed, whitespace-collapsed |
| `label` | as typed, max 120 chars |
| `locale` | the organizer's locale at creation |
| `type` | one of the five offered types |
| `options` | jsonb, for Choix multiple |
| `created_at` | |

Unique on `(school_id, normalized_label, locale)`. A row is written whenever an
organizer creates a custom question.

RLS: organizers may `INSERT` for their own school and have **no `SELECT` at
all**. Suggestions come from a `SECURITY DEFINER` RPC returning only the
aggregate:

```sql
select label, type, options, count(distinct school_id) as schools
  from application_custom_questions
 where locale = $1
 group by normalized_label, label, type, options
having count(distinct school_id) >= 3
 order by schools desc
 limit 8
```

One school therefore never sees another's raw wording — only phrasings at least
three independent schools converged on. That threshold is also the PII guard: a
label containing a student's name will never be written by three schools.

**Consequence:** the suggestion list is empty at launch and stays empty until
the bank fills. What makes the « + » dialog useful on day one is the list of
built-in questions removed from that section, offered back for restoring — which
falls out of reference-based storage for free.

### The lock

Derived, never stored: editable while the exchange has no applications, locked
forever after.

```sql
select 1 from applications where exchange_id = $1 limit 1
```

The editor greys out and `updateApplicationFields` re-checks server-side — the
client is never trusted with the lock.

### The library

Code-defined in `lib/application-templates/library.ts`; one entry today,
`standard`. Assigning copies its structure into `application_fields`. No table.

## User interface

### Card on `/applications`

Beside the apply-link panel, scoped to the active exchange:

```
┌─ Questionnaire de candidature ──────────────┐
│ Modèle : Questionnaire standard             │
│ 54 questions · 4 sections                   │
│ 🔒 Verrouillé — 12 candidatures reçues      │   ← only once locked
│                                              │
│ [Réinitialiser]              [Modifier ↗]   │
└──────────────────────────────────────────────┘
```

Once locked, **Modifier** becomes **Consulter** and the editor is read-only.
**Réinitialiser** confirms, then writes `application_fields` back to `null` —
the same state as an exchange that was never customized, rather than a copy of
the standard structure. One representation for one meaning.

### Editor — `/applications/questionnaire`

Four collapsible section blocks in fixed order, always all four:

```
▾ Élève · 12 questions
   ┌─────────────────────────────────────┐
   │ Photo de l'élève          [Photo]  ✕ │
   │ Nom                            🔒    │
   │ Nationalité               [Texte]  ✕ │
   │ Sait nager ?            [Oui/Non] ✎ ✕ │
   └─────────────────────────────────────┘
   [ ＋ Ajouter une question ]
```

- `first_name`, `last_name`, `email` carry a lock with a tooltip: they are
  collected before the form opens and drive the invitation.
- Everything else, photo included, has the red ×.
- Custom questions also get a pencil (label, required, options).
- Each × and each add is a **persisted server action immediately** — no
  draft/save cycle. Safe precisely because the page is locked the moment a
  candidate appears.
- New questions land at the end of their section.

**Cascading removals**, warned before they act:

| Removing | Also removes | Why |
|---|---|---|
| `sex` | `gender_other` | only shown when *autre* is chosen |
| `family_status` | `separation_housing_address` | only shown when separated / step-family |

### The « + » dialog

```
Ajouter une question — Élève

  Questions retirées
   ⊕ Nationalité              Texte
   ⊕ Pronoms                  Choix

  Suggestions d'autres établissements
   ⊕ Sait nager ?             Oui/Non   · 7 établissements
   ⊕ Taille de vêtement       Texte

  ───────────── ou créer ─────────────
  Intitulé  [………………………………]
  Type      ( ) Texte court  ( ) Texte long  ( ) Date
            ( ) Oui / Non    ( ) Choix multiple
  [✓] Réponse obligatoire
                       [Annuler]  [Ajouter]
```

Restored built-ins come back fully translated. Suggestions are locale-matched to
the organizer, since banked labels are monolingual. Creating a question writes
it to the bank.

Two details the dialog does not expose:

- **Texte long is capped at 150 characters**, matching the profile questions.
  Not configurable — one fewer control, and it keeps the PDF recap's layout
  predictable. Texte court has no explicit cap beyond the column's.
- **Choix multiple options** are stored as `{ value, label }` where `value` is a
  generated stable token (`o1`, `o2`, …) and `label` is the typed text. Answers
  persist the token, so the stored answer never depends on the wording — the
  same discipline the built-in radio fields already follow.

## Validation changes

The parents section requires **one complete parent group**. « Complete » must be
redefined as *all fields of that group still present are filled*. If every field
of one group is removed the rule falls back to the other; if every parent field
is removed the rule is skipped entirely rather than making the form
unsubmittable.

An empty section is allowed and is simply not rendered in the funnel, the review
screen or the PDF.

## Downstream consumers

| Consumer | Change |
|---|---|
| `components/ApplicationForm.tsx` | Takes resolved sections as a prop; the resume page reads the exchange's `application_fields` |
| `actions/apply.ts` → `submitApplication` | **Critical.** The `missingRequired` / `invalidFormat` / `overLimit` gates run against the resolved list. Otherwise a deleted question blocks every submission |
| `components/ApplicationReadView.tsx` | Iterates the exchange's resolved sections |
| `lib/pdf/application-recap.tsx` | Same resolver, so the recap matches the form |

The apply **landing** page needs no change: it collects only first name, last
name and e-mail — the three locked fields — so `get_apply_page_exchange` stays
as it is.

Photo removal ripples in three places: `ApplicationPhotoUpload` is not rendered,
`uploadApplicationPhoto` rejects, and the candidate list falls back to initials,
which `applicantInitials()` already handles for rows without a photo.

## Migration

One migration: the `exchanges.application_fields` column, the
`application_custom_questions` table with RLS, and the suggestions RPC with
`EXECUTE` granted to `authenticated`. Staging first via `db push`, then prod via
MCP `apply_migration`, then regenerate `types/supabase.ts`. Ships with RLS
matrix cases in the same change; `pnpm test:rls` must pass.

## Tests

- **Resolver** — `null` yields today's 54 questions unchanged (the regression
  that matters most); custom structures resolve; unknown refs skip; cascades
  hold.
- **Validation** — submission succeeds with questions removed; the parent-group
  rule with a partially-removed group; the all-parents-removed fallback; the
  `photo` pseudo-field.
- **Editor** — locked fields render a lock and no ×; × persists; the three zones
  of the + dialog; the page is read-only once an application exists.
- **Server action** — `updateApplicationFields` refuses when the exchange has any
  application, and refuses another school's exchange.
- **Bank** — normalization merges « Sait nager ? » and « sait nager? »; the RPC
  returns nothing below three schools and never raw rows.
- **Smoke** — the existing Playwright funnel test passes untouched, proving the
  `null` default path.

## Future direction

Organizer-uploaded custom applications are a separate build. When the bank has
filled, its aggregate is also the evidence for which questions deserve to become
built-in templates in the library.
