# Exchange key-info cards — design spec

**Date:** 2026-07-18
**Status:** Approved (brainstorm) → ready for implementation plan

## Problem

Organizers have exchange-level information students repeatedly need — departure/return
dates, the meeting point, an emergency contact, what to pack, links to maps or a WhatsApp
group. Today there is nowhere in the product to publish it; students get it over email or
not at all. Organizers need to author this once, and students need a place to read it.

## Solution overview

- Organizers author a list of **titled info cards** (title + free-text body) per exchange,
  from the existing **Settings → Programme** section (already scoped to the active exchange).
- Students read those cards from a new **"Infos"** tab on the student portal, alongside the
  existing "Mon dossier" checklist.

MVP scope: authoring (add / edit / delete) and reading only. No rich-text editor, no card
reordering UI.

## Decisions (from brainstorm)

- **Card shape:** a list of titled cards (title + body), not one free-form blob and not
  fixed predefined fields. Structured enough to render cleanly, open-ended enough that
  organizers put whatever their trip needs.
- **Authoring location:** Settings → Programme section (exchange-scoped config, next to
  `ProgramCard` and `ReminderSettingsCard`). No new organizer nav.
- **Student surface:** a real tab. Introduces the student portal's first navigation row:
  **Mon dossier** · **Infos**.
- **Body richness:** plain text, multi-line, with **auto-linked URLs**. No rich-text editor,
  no HTML-injection surface (React escapes everything). A pasted map/WhatsApp link still works.
- **Empty tab:** the "Infos" tab is **always visible**; shows a friendly empty state when the
  organizer has added nothing. (Not conditionally hidden.)
- **Reordering:** none at MVP (YAGNI). A `position` column exists for later; cards render in
  creation order.
- **Required fields:** title required, body optional.

## Data model

New table `exchange_info_cards` — one row per card:

| column        | type        | notes                                                    |
|---------------|-------------|----------------------------------------------------------|
| `id`          | uuid pk     | `gen_random_uuid()`                                      |
| `exchange_id` | uuid        | FK → `exchanges(id)` `on delete cascade`; **FK index**  |
| `title`       | text        | required, ≤120 chars (DB check + app validation)        |
| `body`        | text        | optional (default `''`), ≤2000 chars                    |
| `position`    | int         | `max(position)+1` on insert; display order              |
| `created_at`  | timestamptz | `now()`                                                 |
| `updated_at`  | timestamptz | `now()`                                                 |

Add an index on `exchange_id` (matches the FK-index convention).

### RLS

New table ships with `test:rls` matrix cases in the same PR. Pure RLS — no service-role
involvement.

- **Organizers** whose school is either side of the exchange (`school_a_id` OR
  `school_b_id`) → full `SELECT` / `INSERT` / `UPDATE` / `DELETE`, mirroring how existing
  exchange-child tables scope organizer access. Avoid recursive/self-referential policies.
- **Enrolled students** → `SELECT` only, mirroring the existing
  `students read enrolled exchanges` policy on `exchanges`
  (`exists (select 1 from exchange_enrollments e where e.exchange_id = exchange_info_cards.exchange_id and e.user_id = auth.uid())`).
- Everyone else denied (non-enrolled students, other schools, anon).

RLS matrix cases to add:
- Organizer of the exchange's school reads/writes → allowed.
- Organizer of a different school reads/writes → denied.
- Enrolled student reads → allowed; enrolled student writes → denied.
- Non-enrolled student reads → denied.

## Organizer authoring — Settings → Programme

New `InfoCardsCard` component rendered in the Programme section (`SettingsView`, `section === 'prog'`)
beneath `ProgramCard` / `ReminderSettingsCard`, scoped to the active exchange (resolved exactly
as reminders already are via `resolveActiveExchange`).

Behaviour:
- Lists existing cards in `position` order. Each card is inline-editable (title input +
  multi-line body textarea) with a delete control. An "Ajouter une info" affordance appends a
  new blank card.
- **Read-only when the exchange is archived**, matching `ReminderSettingsCard`
  (`readOnly` / archived notice).

Server actions in `actions/exchanges.ts` (exchange-scoped organizer trust model — same file as
`updateReminderSettings`):
- `getInfoCards(exchangeId)` — returns cards ordered by `position`.
- `addInfoCard(exchangeId, { title, body })`
- `updateInfoCard(cardId, { title, body })`
- `deleteInfoCard(cardId)`

Each write action: `requireOrganizer()` → `assertExchangeInScope` → `assertExchangeWritable`,
then the DB write, then `revalidatePath('/settings')` (and the student surface — see below).

**Validation** returns **structured results**, never thrown strings, for expected outcomes
(empty title, title/body over length) — per the production error-redaction rule in CLAUDE.md.
Only genuinely unexpected failures throw.

## Student view — "Infos" tab

- Add a **tab row** to `app/(student)/layout.tsx`, directly under `StudentTopBar`:
  **Mon dossier** → `/my-forms`, **Infos** → `/infos`, with the active route highlighted
  (client component using `usePathname`). This is the portal's first navigation.
- New route `app/(student)/infos/page.tsx`.
- New action `getStudentInfoCards()` — returns the cards for the exchange(s) the student is
  enrolled in, ordered by `position`. When the student belongs to multiple exchanges, group by
  exchange name (reuse the existing `multiExchange` notion from the dossier); a single flat list
  in the common single-exchange case.
- **Rendering:** title + body, with line breaks preserved and URLs auto-linked via a small
  **pure helper** (`lib/student/linkify.ts` or similar): splits body text on a URL regex and
  emits React-escaped `<a href target="_blank" rel="noopener noreferrer">` for matches, plain
  text otherwise. No `dangerouslySetInnerHTML`.
- **Empty state:** tab always present; when there are no cards, show a friendly message
  ("Ton organisateur n'a pas encore ajouté d'informations.").

## i18n

- Add keys to **all 5 locale files** (`messages/{en,fr,es,it,de}.json`):
  - `student.infos.*` (tab label, page heading, empty state)
  - organizer Programme info-card labels (heading, add button, title/body placeholders,
    delete, validation messages)
- The existing `messages/__tests__/parity.test.ts` enforces key completeness across locales.

## Testing

- **Unit:** the auto-link helper (pure — URL detection, escaping, no-URL passthrough); card
  validation (empty title, over-length title/body). `DossierView` and existing dossier logic
  are untouched.
- **RLS matrix (`pnpm test:rls`):** the cases listed under RLS above. Ships with the migration.
- **i18n parity:** covered by the existing parity test once keys are added.

## Rollout

- **Migration:** written locally in `supabase/migrations/`, applied to **staging first**
  (`supabase db push --db-url "$STAGING_DB_URL"`), then to prod via MCP `apply_migration`;
  reconcile the filename version with the stamped ledger version if they differ.
- **Types:** regenerate `types/supabase.ts` via MCP `generate_typescript_types`, then
  `npx tsc --noEmit`.
- **Branch → PR.** Autonomy stops at the PR; Bjorn merges with a merge commit.
- Verifying Changes gate (`pnpm lint`, `pnpm test`, `pnpm build`) plus `pnpm test:rls` before
  any push.

## Out of scope (YAGNI)

- Rich-text formatting (bold/lists) in card bodies.
- Card reordering UI (drag or move up/down).
- Per-card visibility toggles, scheduling, or draft/publish states.
- Notifying students when info changes (they'll see it next visit; email is a separate concern).
