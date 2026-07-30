# Application tab redesign — design

**Date:** 2026-07-30
**Status:** approved, not yet implemented
**Scope:** the organizer's Candidatures tab (`/applications`) and the server
actions behind it. The public funnel (`/apply/<slug>`), the review flow, and the
questionnaire editor (`/applications/questionnaire`) are unchanged.

## Problem

Setting up an application funnel is two decisions — *which questionnaire* and
*who gets invited* — but the page presents them as one dialog that asks for
neither. `OpenApplicationsDialog` asks only for a deadline, then reveals a link
and an email box; the questionnaire is never mentioned. The template concept
already exists in code (`lib/application-templates/library.ts`) and is invisible
in the product, so `QuestionnaireCard` hardcodes the string "Standard" and no
exchange records which template it came from.

Meanwhile the steady-state page carries three competing blocks under the grid:
a collapsible invitation panel (open/closed toggle, deadline, copy-link, invite)
and a questionnaire card (template, question count, reset, edit) — both of them
mostly inert once the funnel is running, because the questionnaire locks the
moment the first application arrives.

## Shape

Two steps, in the organizer's words:

1. **Create the application** — pick a template from a library, pick a deadline.
   Creating opens the funnel: `/apply/<slug>` is live the moment step 2 appears.
2. **Invite the students** — paste emails and/or copy the magic link.

Once invitations exist the application is frozen and the page becomes a pure
tracking list. Nothing to configure, nothing to re-invite.

## State machine

Four states, from **derived** signals. No new state column.

| State | Condition | Page shows |
|---|---|---|
| **Vierge** | `!created` | Centered blank + « Ajouter une candidature » |
| **Bibliothèque** | client-only, entered from the CTA | Template cards + deadline + « Ajouter » |
| **Créée** | `created && applicationCount === 0` | The application card. No tabs, no grid. |
| **En cours** | `applicationCount > 0` | Editable deadline line + tabs + grid. Nothing else. |

```
created ⟺ application_deadline != null || application_open || applicationCount > 0
```

Every legacy exchange that ever opened applications therefore lands in the right
state with no backfill.

`applicationCount` is the **unfiltered** count already returned by
`getQuestionnaire` — deliberately the same signal that trips the questionnaire
lock, so "the questionnaire is frozen" and "the configuration controls
disappeared" can never disagree. `apps.length` from `listApplications` is the
wrong signal: it hides untouched drafts, so a funnel with three abandoned drafts
would show a locked questionnaire beside an « Ajouter » button.

The page branches server-side, so the pre-grid states never ship the grid's
JavaScript and never run `listApplications` (which signs photo URLs):

```
app/(organizer)/applications/page.tsx
  ?id=            → ApplicationDetail   (unchanged)
  count === 0     → ApplicationSetup    (Vierge · Bibliothèque · Créée)
  count > 0       → CandidaturesView    (deadline line · tabs · grid)
```

## Screens

### Vierge

Today's centered empty state with new copy: title « Aucune candidature », body
« Choisissez un modèle pour commencer », CTA « Ajouter une candidature ».

### Bibliothèque

The same page, held in `useState` — no route, no dialog. A grid of template
cards (name, one-line description, question count, « Choisir »), then a
`DateField` for the deadline and an « Ajouter la candidature » button that stays
disabled until a card is selected. `APPLICATION_TEMPLATES` has one entry today,
so one card renders; the grid is built for N with no "à venir" placeholder
ghosts. « Annuler » returns to Vierge.

**Entering the library is never destructive.** The write happens on
« Ajouter », not on « Choisir », so an organizer who opens it to look around
and backs out keeps their questionnaire.

### Créée

```
Candidature · Standard
54 questions · date limite 12 juin 2026
[ Personnaliser ]  [ Changer de modèle ]        [ Inviter les élèves ]
```

- « Inviter les élèves » opens a dialog carrying both of today's methods: the
  copyable `/apply/<slug>` link and `InviteByEmailForm`.
- « Personnaliser » links to the existing `/applications/questionnaire`.
- « Changer de modèle » re-enters Bibliothèque with the current deadline
  pre-filled. Picking any template there — including the current one —
  overwrites, which absorbs today's « Réinitialiser » into a single control.

### En cours

The grid, its tabs, and one editable deadline above them. No template line, no
copy-link, no invite, no open/closed toggle.

## Data

### Migration

```sql
alter table public.exchanges add column application_template text;
```

Nullable; `null` means "created before templates existed" and resolves to
`'standard'`. No grant or policy change is needed — organizers already hold
table-level UPDATE on `exchanges` (see the notes in
`20260719150427_good_news_template.sql` and
`20260729113121_application_questionnaire.sql`), so the column is writable by
exactly the right people the moment it exists.

Storage is a column rather than a key inside `application_fields` because
provenance and structure are different facts with different lifetimes: the
template id must survive an organizer deleting half the questions, and it must
survive a document that fails to parse. It also leaves
`lib/application-fields.ts` — kept deliberately single-purpose by the template
editor spec — untouched.

### `application_fields` is materialized at creation

`createApplication` writes `templateById(id).build()`, **not** `null`.

`resolveApplicationSections(null)` falls back to `APPLICATION_SECTIONS` — the
*standard* set — at five call sites (`actions/apply.ts` ×3,
`app/apply/resume/[token]/page.tsx`, `components/applications/ApplicationDetail.tsx`).
If `null` meant "this exchange's template, unmodified", every one of those would
silently render the standard questionnaire to a candidate applying under
template #2, and the organizer would review answers to questions the candidate
never saw. Materializing keeps that resolver and all five call sites exactly as
they are.

Materializing costs nothing in translation freshness: templates store built-in
questions **by reference** (`{ ref: 'first_name' }`), so a later copy fix in the
message catalogs still reaches every exchange built from the template.

### Server action

One new action, `createApplication(exchangeId, templateId, deadline)`, in
`actions/questionnaire.ts` — that file's stated trust model (authenticated
organizer, own school, request-scoped RLS client) is precisely this one.

- `requireOrganizer()` → `school_a_id` check → `assertExchangeWritable`, whose
  archived throw is caught and returned as a structured `'archived'` (prod
  redacts thrown Server Action messages to an opaque digest).
- Refuses when `applicationCount > 0`, reusing the existing lock. This is also
  what makes « Changer de modèle » safe.
- Validates `templateId` through `templateById` and rejects an unknown id.
- Rejects a deadline before today as `{ ok: false, reason: 'deadline_past' }` —
  creating with a past date yields an instantly dead funnel. `DateField` has no
  `min` prop and this design does not add one; the backlog already carries
  `DateField` work.
- Writes `application_template`, `application_fields`, `application_open = true`
  and `application_deadline` in **one** UPDATE, so there is no half-created
  application if a second write fails.
- Returns the existing `QuestionnaireResult` shape from
  `lib/questionnaire/result.ts`.

`resetQuestionnaire` is **deleted**. Calling `createApplication` with the same
template is a reset — same lock check, same outcome — and `QuestionnaireCard`
was its only caller.

`setApplicationOpen` survives, called with `open: true` from the deadline line
in En cours; it keeps the archived guard and the RLS-scoped write.

`getExchanges`' select gains `application_template`. Template names and
descriptions live in the message catalogs keyed by template id
(`organizer.questionnaire.templates.standard.*`), so all five locales are
covered by construction rather than by a hardcoded French string.

## Files

**New**

| File | Purpose |
|---|---|
| `lib/applications/state.ts` | Pure state selector, no React — same shape as the existing `tabs.ts` |
| `components/applications/ApplicationSetup.tsx` | Vierge · Bibliothèque · Créée and the create/invite state |
| `components/applications/TemplateLibrary.tsx` | Presentational card grid over `APPLICATION_TEMPLATES` |
| `components/applications/InviteStudentsDialog.tsx` | Copy-link + `InviteByEmailForm` |
| `components/applications/ApplicationDeadlineLine.tsx` | The En cours editable deadline |

**Deleted**

`OpenApplicationsDialog`, `InvitationPanel`, `QuestionnaireCard`,
`InviteByEmailDialog` (a 33-line wrapper the new dialog supersedes),
`resetQuestionnaire`, the four corresponding component test files, and the
`organizer.applications.openDialog`, `organizer.applications.panel` and
`organizer.questionnaire.card` catalog blocks across five locales.

This drops `CandidaturesView` from 370 lines to roughly 270 and — the actual
point — stops it owning open/deadline/dialog state that has nothing to do with
reviewing candidates.

## Accepted consequences

These are decisions, not oversights.

- **Nothing ever writes `application_open = false`.** Closing applications early
  means setting the deadline to a past date; `/apply` already gates on
  `today <= application_deadline`. One control with one meaning replaces two
  overlapping ones.
- **The two deadline paths validate differently, on purpose.**
  `createApplication` rejects a past date — a funnel born dead is always a
  mistake. The En cours deadline line accepts one, because that is the
  documented way to close applications early. Do not "fix" the second to match
  the first.
- **An exchange sitting at `application_open = false` today has no button to
  reopen it.** It self-repairs the first time the organizer edits the deadline,
  since that save writes `true` — but until then its `/apply` link 404s.
- **The template is chosen once.** After the first application arrives it cannot
  be changed, matching the questionnaire lock exactly.
- **No per-exchange multiple applications.** One exchange has one `apply_slug`,
  one questionnaire, one deadline. "Add an application" is a one-time action.

## Testing

- `lib/applications/__tests__/state.test.ts` — the selector across all four
  states, including the legacy exchange (deadline set, count 0) and the drift
  case (`applicationCount > 0` while `listApplications` returns empty, which
  must still resolve to En cours).
- `actions/__tests__/questionnaire.test.ts` — `createApplication`'s refusal
  paths (unknown template, past deadline, locked, foreign exchange, archived)
  and a happy path asserting all four columns in a single update.
- `components/applications/__tests__/ApplicationSetup.test.tsx` — Vierge CTA
  opens the library; « Ajouter » stays disabled until a template is chosen;
  Créée renders all three actions; the invite dialog carries both methods.
- `pnpm test:rls` — new matrix cases mirroring the `application_fields` pair at
  `tests/rls/matrix.test.ts:266`: school B cannot UPDATE
  `exchanges.application_template` on exchange A; organizer A can.
- `scripts/seed-demo.mjs` gains `application_template: 'standard'` beside the
  existing `application_open` / `application_deadline`, so the demo exchange is
  not on the legacy null path.
- Smoke is unaffected: `tests/smoke/portals.spec.ts` only asserts `/applications`
  renders, and `tests/smoke/apply.spec.ts` exercises the public funnel.
- Migration path per CLAUDE.md: staging first
  (`supabase db push --db-url "$STAGING_DB_URL"`), then prod via MCP
  `apply_migration`, then the `list_migrations` stamp check with a `git mv` if
  the ledger drifts, then `generate_typescript_types` → `types/supabase.ts` →
  `npx tsc --noEmit`.
- Full gate before merge: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:rls`.
