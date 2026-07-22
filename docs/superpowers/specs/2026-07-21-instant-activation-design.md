# Instant activation: deadline at add time, no Activate button

**Date:** 2026-07-21
**Status:** Approved, ready for planning

## Problem

Adding a form or document to an exchange takes too many steps and the
intermediate state is not intuitive.

Today, clicking « Ajouter » in the Fichiers tab always produces a `draft`
template. For standard-library entries the organizer is never asked for a
deadline at all. To make the template real they must then open its detail
drawer, read a « Avant d'activer » hint telling them a deadline is required,
follow a « Modifier le modèle » link to a separate editor page, set the
deadline, come back, and click « Activer ».

The goal is to collect what a template needs at the moment it is added, and to
drop the manual activation step entirely: setting the deadline *is* the act of
publishing it to families.

## Current behaviour

`components/forms/FichiersView.tsx` → `LibraryDrawer` offers two add paths:

- `addStandardTemplate(exchangeId, key)` for the 8 standard-library entries —
  inserts with `deadline: null`, no prompt of any kind.
- `createDraftTemplate(formData)` for the three custom tiles (upload PDF,
  create online form, request document) — has an *optional* deadline field.

Both insert `status: 'draft'`. `FichiersView` then opens the detail drawer
(`FormDrawer` or `DocDrawer`), each of which renders an « Activer » button and
an « Avant d'activer » hint block fed by `activationHints` in
`lib/forms/rollup.ts`.

`activateTemplate` (`actions/forms.ts:260`) is the gate. It requires:

| Gate | Applies to |
|---|---|
| `deadline` is set | every kind |
| `template_file_path` is set | `pdf` |
| at least one `form_fields` row | `online` |
| complete `exchange_program_details` | `fillable` |
| a non-empty student selection | `audience = 'conditional'` |

Activation is also what publishes the work: it flips `status` to `active`, and
assignments are created — by DB trigger for `audience = 'all'`, by explicit
insert for `conditional`.

## Four gaps behind one symptom

Removing the Activate button requires every add path to satisfy its own gate at
add time. Four things stand in the way.

**(a) The deadline is never requested on add.** The core issue.

**(b) The AST demands a school-uploaded PDF.**
`lib/forms/standard-library.ts:1-5` states the policy: *"Templates are added
WITHOUT files — the PDFs are school-specific."* That is true of most PDFs but
**not** of the AST: CERFA 15646 is a national French form, identical for every
school. A copy already sits unused in the repo at
`docs/exampleSchoolFiles/AST.pdf`, referenced by zero code.

**(c) Fillable forms need program details that no flow forces you to fill.**
`exchange_program_details` is edited only in Réglages → Programme. On a fresh
account it is empty, so all four fillable entries are blocked at add time.

Requirements per form, derived from each definition's `variables` array and
`VARIABLE_REQUIREMENTS` in `lib/forms/fillable/types.ts`:

| Field | Décharge | Médicale | Absence | Engagement |
|---|:-:|:-:|:-:|:-:|
| `destination` | ● | | ● | |
| `travel_start` + `travel_end` | ● | ● | ● | |
| `chaperones` | ● | ● | | |
| `association_name` | ● | | | ● |
| `receiving_school_name` | ● | | ● | |
| `sending_school_name` | | | ● | ● |
| `proviseur_name` | | | ● | |
| `sending_city` | | | ● | |
| `absence_dates` | | | ● | |
| **Total** | **6** | **3** | **8** | **2** |

The union is all ten fields, but no single form needs more than eight.

Onboarding *looks* like it already covers this — step 2 pre-titles cards
`Dates clés`, `Destination`, `Hébergement`, `Contact organisateur`,
`À prévoir` — but those write `exchange_info_cards`: free prose displayed to
students. Program details are structured values substituted into legal PDF
text ("l'échange se déroulera à `{destination}` du `{travel_period}`"). A card
body cannot feed a token, so today the organizer types the destination twice,
in two places, for two purposes.

**(d) Custom online forms need at least one question**, which cannot be
authored in a compact add prompt.

## Design

### 1. The invariant

After this change the only template that is ever `draft` is a **custom online
form, between its creation and its first saved question**. Every other add path
activates within the same request.

`activateTemplate` stops being an exported server action and becomes a private
helper in `actions/forms.ts`, called by `addStandardTemplate`,
`createDraftTemplate` and `addField`. Its gate logic is unchanged and still
runs — it simply can no longer *fail* on an add path, because the add UI now
collects every input the gate demands. Keeping the gate intact means a bug in
the new UI degrades to a template that stays `draft`, never to a half-configured
template published to families.

Because the missing pieces are collected at add time, no background sweep or
reconciliation job is needed.

### 2. Onboarding step 2 becomes structured

`app/onboarding/OnboardingForm.tsx` step 2 keeps `Nom du programme` and gains
structured inputs that write `exchange_program_details`:

- **Required:** destination, date de départ, date de retour. These feed three of
  the four fillable forms and both generated cards.
- **Optional:** accompagnateurs, nom de l'association, lycée d'origine
  (**pre-filled from the school name captured in step 1**), établissement
  d'accueil, nom du proviseur, ville d'origine. Optional because an organizer
  signing up in September may genuinely not know the receiving school yet;
  the add-time fallback (§3) collects whatever is left blank.
- **Not collected:** `absence_dates`, which is specific to one form and belongs
  in that form's add prompt.

The `Destination` and `Dates clés` cards are **generated** from those values
rather than typed again. `Hébergement`, `Contact organisateur` and `À prévoir`
remain free-text and optional. Since two cards are now always generated, the
existing "at least one filled card" gate (`NO_CARDS_MESSAGE` in
`lib/onboarding/first-exchange.ts`) is satisfied automatically and its
enforcement is removed.

### 3. The add flow

**Standard-library entries.** Clicking « Ajouter » expands that row in place —
the drawer is not covered and the organizer keeps their position in the list,
so adding three documents is three quick expansions rather than three dialogs.
The expansion shows the deadline plus *only* what that entry still needs:

- a Décharge on an exchange with complete details → one date field;
- an Engagement on a **second** exchange → date + association + lycée d'origine;
- an Absence → date + `absence_dates`, always, plus any blank details.

Program-detail values entered here are written to `exchange_program_details`
for the exchange, so a later fillable form asks for less or nothing.

This fallback is **load-bearing, not a nicety**: onboarding runs once per
organizer, but program details are per **exchange**. Every exchange after the
first starts with none.

**Custom entries** keep the existing create form in the drawer, with two
changes: the deadline becomes required, and conditional documents gain their
student picker there so they activate on add like everything else.

**Custom online forms** take name + deadline, then close the drawer and land
the organizer **directly on the editor** at `/forms/[id]`. Saving the first
question activates the template — no return trip, no button.

### 4. AST ships with its PDF

`AST.pdf` moves out of `docs/exampleSchoolFiles/` to
`lib/forms/assets/ast-cerfa-15646.pdf`, read server-side with `fs` at add time
(not `public/`, which would expose it as a static route for no reason).
`insertStandardTemplate` uploads it into the school's own
`form-templates/<school_id>/<template_id>.pdf` path on add, exactly as a manual
upload would. This reuses the existing `template_file_path` plumbing, storage
bucket and RLS — no second read path, no shared-file access question — and the
organizer can still replace it via Modifier.

The comment in `lib/forms/standard-library.ts` is corrected to record that the
school-specific-PDF rule holds for every entry *except* the national CERFA.

### 5. What is removed

- the « Activer » button in `FormDrawer` and `DocDrawer`;
- the « Avant d'activer » hint block in both drawers;
- `activationHints` in `lib/forms/rollup.ts` and its `MSG_*` re-exports where
  they become unused;
- `activateTemplate` from the module's exported surface.

`statusPill` **stays** — the transient online-form draft still needs a label.
`updateTemplateMeta`'s "un modèle actif doit garder une échéance" guard stays:
it protects an already-published template from losing its date.

### 6. Migration

Production contains only test data, so no careful reconciliation is warranted.
One migration activates every existing draft that already passes its gates:

```sql
update form_templates set status = 'active'
where status = 'draft' and deadline is not null
  and kind <> 'fillable'
  and (kind <> 'pdf' or template_file_path is not null)
  and (kind <> 'online' or exists (
        select 1 from form_fields where template_id = form_templates.id));
```

Fillable drafts are deliberately excluded rather than join-checked against ten
nullable detail columns; any that remain draft are test rows and can be deleted
from the UI. No legacy activate path is kept.

Per CLAUDE.md the migration is applied to **staging first**, then to prod via
MCP `apply_migration`. It touches no RLS policy, no table structure and no
bucket, so `pnpm test:rls` needs no new matrix cases — but it must still pass.

## Consequences

Adding a form now publishes it to families immediately. This is the intended
behaviour, and the exposure is smaller than it sounds: assignments only
materialise for enrolled students, so a template added while setting up an
exchange reaches nobody until students are enrolled. There is no longer a
"parked draft" state an organizer can deliberately sit in; deleting and
re-adding replaces that workflow, and no real user depends on it.

## Testing

Removed: `activationHints` unit tests, and the activate-button assertions in
the `FormDrawer` / `DocDrawer` tests.

Added:

- **Add paths** — one test per kind (`doc`, `fillable`, `pdf`/AST, conditional
  `doc`) asserting the template lands `active` with its deadline in a single
  call, and that the custom online form lands `draft`.
- **Missing-detail computation** — a pure helper mapping a standard-library
  entry plus the current `exchange_program_details` row to the fields the row
  expansion must show. Table-driven across the four fillable forms, covering
  complete details (no extra fields), empty details (the form's full set), and
  partial details.
- **Second-exchange fallback** — adding a fillable form to an exchange with no
  details prompts for that form's fields, writes them to
  `exchange_program_details`, and activates.
- **Auto-activation** — `addField` on a draft online form with a deadline
  activates it; on one without a deadline it does not.
- **AST bundling** — `addStandardTemplate('ast')` uploads the bundled PDF and
  sets `template_file_path`.
- **Onboarding** — step 2 writes `exchange_program_details`, generates the
  Destination and Dates clés cards, pre-fills lycée d'origine from step 1, and
  rejects a submission missing destination or travel dates.

Gate before merge: `pnpm lint`, `pnpm test`, `pnpm build`, plus `pnpm test:rls`
for the migration.
