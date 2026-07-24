# Organizer onboarding overhaul — design

**Date:** 2026-07-24
**Branch:** `feature/onboarding-overhaul`
**Base:** `main` at the school-registry merge (`13d0abc`) — step 1 is the registry picker, not a free-text name.

## Problem

The organizer onboarding flow has seven defects, from the confirmation email through
to the first acceptance email sent months later:

1. Confirming an email lands the organizer in a blank tab instead of in the app.
2. Closing the tab mid-onboarding silently discards everything typed in step 2.
3. Finishing onboarding lands on the Overview, which is not where a new organizer
   has anything to do.
4. The departure/return ordering error only appears after pressing « Continuer ».
5. Six of step 2's fields are labelled « facultatif » while being genuinely required
   by the standard forms — so the forms break later instead of failing here.
6. The « Bonne nouvelle » acceptance email ships with four `[à compléter]`
   placeholders because nothing in the organizer flow ever asks for those values.
7. Pressing « Continuer » briefly flashes a different screen.

## Non-goals

Owned by parallel sessions; this branch must not touch them:

- **The Applications page itself.** This branch changes only what redirects to it.
- **The « Bonne nouvelle » email template and the never-send-with-blanks guard.**
  This branch collects and stores the data and exposes a pure helper for the guard
  to call.
- **`claim_school` and the school registry.** Read from `school_registry`; never
  alter the RPC or the table.

## Design

### 1. Entry — every confirmation path lands in onboarding

Three paths confirm an organizer, and all three currently aim at `/dashboard`,
relying on the organizer layout gate to bounce them to `/onboarding`:

| Path | Today |
|---|---|
| 6-digit code | `confirmSignupCode` → `verifyOtp` → `provisionOrganizer` → `redirect('/dashboard')` |
| Email confirmation link | Supabase `GET /auth/v1/verify`, `emailRedirectTo` = `${NEXT_PUBLIC_APP_URL}/dashboard` |
| Google | `GoogleButton intent="organizer_signup" next="/dashboard"` |

All three are repointed at `/onboarding`. Laundering a fresh signup through a page
it is guaranteed to be bounced off adds a redirect that can only fail: if the gate
does not fire, `/dashboard` renders for a user with no school, and any session
hiccup sends them to `/login` instead of into the product.

`GET /auth/v1/verify` is the prime suspect for the blank tab — it is already
recorded in `docs/` and in session memory as the broken flow, versus the working
`POST`/`token_hash` flow behind `app/auth/confirm/route.ts`. **This is a hypothesis,
not a finding.** The implementation plan reproduces the blank tab on staging before
any fix is written. If the cause is the signup email template still carrying a
`{{ .ConfirmationURL }}` link, the fix is a Supabase template change
(link → `/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/onboarding`),
which is dashboard configuration: the plan records it as a manual step for Bjorn,
alongside the Stripe portal and Google OAuth steps, rather than pretending code can
apply it.

### 2. Steps and exit

Onboarding becomes two steps:

1. **Votre établissement** — country + registry combobox. Unchanged from the
   registry merge.
2. **Votre premier programme** — exchange name, destination, date de départ,
   date de retour. Four inputs, all required.

Step 3 (« Invitez vos collègues (optionnel) ») is deleted. Colleague invitation
already exists in Réglages, nothing on day one depends on it, and it was the only
screen standing between the organizer and the page they should land on.

On success `completeFirstExchange` performs the navigation itself:

```ts
revalidatePath('/', 'layout')   // sidebar picks up the new exchange
redirect('/applications')
```

Server-side redirect rather than `router.push`: it is one navigation decided in one
place, with no client-side step transition left to race (see §7).

`OnboardingPage`'s own « already onboarded » bounce also changes from `/dashboard`
to `/applications`. The only realistic visitor to `/onboarding` with onboarding
already complete is someone who just completed it, and this makes the redirect
target identical on both paths — so even if the race in §7 survives, it becomes
invisible rather than merely rare.

### 3. Abandonment and resume

- **Step 1 already persists.** `claim_school` writes `schools.name/uai/country`
  before step 2 renders, so a returning organizer resumes at step 2. Unchanged.
- **Step 2 autosaves to `localStorage`**, key
  `eazyexchange:onboarding-draft:<school_id>`, payload
  `{ v: 1, exchangeName, destination, travel_start, travel_end }`.
- **Restore on mount**, in a `useEffect` rather than as `useState` initialiser —
  reading `localStorage` during render breaks SSR hydration.
- **Next login**: the layout gate still hard-bounces to `/onboarding`; the
  organizer sees step 2 with their text intact.

Rejected alternatives: a server-side draft row (a migration, a new RLS policy and
matrix cases, for an event that costs four fields of retyping); and creating the
exchange as soon as its name is typed (a half-configured exchange consumes the
trial cap of 1 and appears in the sidebar mid-onboarding).

The payload holds school and trip data only — no student or parent PII ever reaches
`localStorage`.

**Clearing.** Success redirects server-side, so there is no success branch in the
client to clear from. The draft is therefore cleared immediately *before* invoking
the action, and re-saved explicitly if the action returns a problem — the autosave
effect will not re-fire on its own, because a failed submit changes no state.

### 4. Date validation

`travelOrderProblem(start, end)` in `lib/exchange/travel-dates.ts` already encodes
the rule and is already shared by onboarding, Réglages → Programme, and the
add-a-form prompt. Nothing about the rule changes; only when it is consulted.

In `OnboardingForm`, derive it during render from the two date values, show the
message directly beneath the date inputs as soon as both are set, and disable
« Continuer » while it is non-null. The server-side check in `detailsProblem` stays
exactly where it is: the client gains immediacy, never authority.

### 5. Field audit

Every field currently hidden behind « Informations complémentaires (facultatif) »
is required by at least one standard fillable form, so « optional » is inaccurate
today:

| Field | Required by |
|---|---|
| `association_name` | Décharge, Engagement |
| `sending_school_name` | Engagement, Absence |
| `receiving_school_name` | Décharge, Absence |
| `proviseur_name` | Absence |
| `sending_city` | Décharge, Absence |
| `chaperones` | Décharge, Médical |
| `absence_dates` | Absence — never collected in onboarding at all |

Resolution — two are derived, five are deferred, none stay optional:

- **`sending_school_name` — derived, never asked.** The action sets it from
  `profile.schools.name`. Today the client prefills it and sends it back; deriving
  it server-side removes a round trip through the browser for a value the server
  already holds.
- **`sending_city` — derived for France, never asked.** `schools.uai` joins to
  `school_registry.commune`. UAI is not unique (65 codes are shared by multi-site
  establishments), so the lookup disambiguates on `(uai, name)` first and falls back
  to the lowest `id` — the same precedence `claim_school` uses. Non-FR schools have
  `uai = null` and fall through to the deferred path below.
- **The remaining five — deferred to the existing just-in-time prompt.** They are
  unknowable to us and frequently unknown to the organizer at signup (a school
  signing up in September may not yet have a partner school or a chaperone list).
  `missingProgramFields` → `ProgramDetailFields` already asks for exactly the
  missing columns at the moment a form needing them is added. No new machinery.

Step 2's three optional Info cards (Hébergement, Contact organisateur, À prévoir)
are also cut. Students still land on a non-empty `/infos`: the Destination and
Dates clés cards are generated from the required fields. The three prompts remain
addable any time in Communication → Infos.

Consequently `ONBOARDING_CARD_PROMPTS`, `filledCards`, and `completeFirstExchange`'s
third parameter are removed rather than left orphaned, and `FirstExchangeDetails`
shrinks to `{ destination, travel_start, travel_end }`.

**Net effect: step 2 keeps the same four required inputs it has today (exchange
name, destination, départ, retour) and loses all nine optional ones — six detail
fields and three Info cards. Zero optional inputs remain.**

### 6. Acceptance-email data capture

The email needs four values it never receives. « Dates du séjour » is already held
as `travel_start`/`travel_end`; the other three are new.

**Storage** — three columns on `exchange_program_details`, the row Réglages →
Programme already edits:

| Column | Type | Why |
|---|---|---|
| `participation_cost` | `text` | Free text, not numeric. Real answers are « 850 € par élève, vol et hébergement inclus » or « gratuit », which a numeric column cannot hold. |
| `payment_details` | `text` | A HelloAsso link or « chèque à l'ordre de… » instructions. |
| `confirmation_deadline` | `date` | The family's decision deadline. |

RLS needs no new policy: both existing policies on the table are row-level, so new
columns inherit them. Enrolled students gain read access, which is correct — these
are the values their family receives by email — and none of it is student PII. RLS
matrix cases still assert readable-not-writable, because inheritance is the kind of
assumption that should be tested rather than reasoned about.

**Capture surface** — one new labelled group inside `ProgramDetailsCard`, not a
second card. `saveProgramDetails` upserts the whole row, so a sibling card saving
three columns would null the other ten. One card, one « Enregistrer ». The card's
subtitle is updated: today it claims these fields only fill the signable forms,
which stops being true.

A prompt on the Applications page before the first acceptance was considered and
rejected — that surface belongs to a parallel session, and a cross-branch
integration contract would have to land in both branches before either works.

**Contract with the email session** — a new pure module,
`lib/exchange/good-news-fields.ts`:

```ts
export type GoodNewsField =
  | 'travel_dates' | 'participation_cost' | 'payment_details' | 'confirmation_deadline'

export function missingGoodNewsFields(details: ProgramDetailsValues | null): GoodNewsField[]
export const GOOD_NEWS_FIELD_LABELS: Record<GoodNewsField, string>  // French
```

`travel_dates` is missing when either date is blank, so the guard checks one helper
for all four placeholders. No React, no Supabase — the same shape as
`lib/forms/add-requirements.ts`. The email session imports it, blocks the send, and
deep-links to `/settings`. No shared file, no merge conflict.

### 7. The « Continuer » flash

Mechanism: `completeFirstExchange` ends with `revalidatePath('/', 'layout')`, which
re-renders the *current* route as part of the action's response. `OnboardingPage`
re-runs, now sees a named school and one owned exchange, `mustOnboard` returns
false, and it `redirect('/dashboard')`s. The client applies that payload — flashing
`/dashboard` or `app/(organizer)/loading.tsx` — while `setStep(3)` races it.

Both changes in §2 dissolve it: the navigation moves into the action, so no
client-side step transition remains to lose the race, and the page's own bounce
target becomes `/applications`, so the racing render and the intended destination
agree.

**This is a hypothesis with a plausible mechanism, not a confirmed diagnosis.** The
plan reproduces the flash on staging first, per `superpowers:systematic-debugging`.
If the reproduction shows a different cause, the fix changes and this section is
rewritten. Fallback if the server-side redirect proves unreliable in the
reproduction: `router.replace('/applications')` on the client, with the page's
bounce target still `/applications`.

## Data model

One migration, `<stamp>_acceptance_email_details.sql`:

```sql
alter table exchange_program_details
  add column participation_cost   text,
  add column payment_details      text,
  add column confirmation_deadline date;
```

No policy changes. Applied to staging first, then to prod via MCP
`apply_migration`, then `types/supabase.ts` regenerated and `npx tsc --noEmit` run,
per CLAUDE.md.

`types/db.ts`'s `ExchangeProgramDetails` alias picks the columns up automatically,
so `ProgramDetailsCard` sees them with no type work.

`ProgramDetailsValues` in `lib/forms/fillable/types.ts` is deliberately **left
alone**. It means « what the fillable forms consume », and `keyof
ProgramDetailsValues` is load-bearing across four other declarations —
`DETAIL_LABELS`, `DETAIL_ORDER`, `EMPTY_DETAILS`, and `DetailState` /
`EMPTY_DETAIL_STATE` / `LABEL_KEY` in `ProgramDetailFields`. Adding three keys
there would force entries in all of them and make the add-a-form prompt ask for a
payment link when an organizer adds a medical form.

Instead `good-news-fields.ts` declares its own minimal input type, structurally
satisfied by the generated row:

```ts
export type GoodNewsValues = {
  travel_start: string | null
  travel_end: string | null
  participation_cost: string | null
  payment_details: string | null
  confirmation_deadline: string | null
}
```

`ProgramDetailsInput` in `actions/fillable.ts` gains the three keys, since
`saveProgramDetails` writes them.

## Error handling

- `completeFirstExchange` keeps structured returns for expected outcomes (invalid
  input, plan cap) and throws only for genuinely unexpected failures — production
  redacts thrown Server Action messages. Because success now redirects, its return
  type becomes `Promise<FirstExchangeProblem | void>` rather than a union carrying
  an `ok: true` arm that can never be observed:

  ```ts
  export type FirstExchangeProblem = { error: 'invalid' | 'limit'; message: string }
  ```

  The client reads it as `const problem = await completeFirstExchange(...); if
  (problem) setExchangeError(problem.message)`. `CompleteFirstExchangeResult` is
  replaced by this type.
- `saveProgramDetails` gains length validation for the two new text columns,
  reusing the existing `MAX_FIELD` guard.
- The `localStorage` draft is best-effort: a `QuotaExceededError` or a browser with
  storage disabled must degrade to today's behaviour, never break onboarding. Read
  and write are both wrapped.

## i18n

`OnboardingForm` is hard-coded French and stays that way — it renders before a
tenant exists and has no locale to resolve. Only the Settings card's three new
labels and hints need all five `messages/*.json`. Per session memory, French
transcription runs at Sonnet tier and the apostrophe guard runs afterwards.

## Testing

| Layer | Coverage |
|---|---|
| Pure units | draft serialize/restore/clear + key derivation; `missingGoodNewsFields` across all-blank, partial, complete |
| Action units | `sending_city` derived from the registry incl. the shared-UAI fallback; `sending_school_name` derived from the profile; step-2 validation unchanged |
| Component | date error appears on change not on submit; « Continuer » disabled while invalid; step 3 absent; draft restored on mount |
| RLS | matrix cases for the three new columns (enrolled student reads, cannot write) |
| Gate | `pnpm lint && pnpm test && pnpm build && pnpm test:rls` |
| Manual | staging reproduction of the blank tab and the flash **before** fixing, then re-run after |

## Rollout order

1. Reproduce items 1 and 7 on staging; record findings.
2. Migration → staging → prod → regenerate types.
3. Code changes.
4. Full gate + staging browser pass.
5. Merge to `main` on Bjorn's confirmation.

## Risks

- **Two hypotheses, not two diagnoses.** Items 1 and 7 are reasoned from code, not
  observed. The plan front-loads reproduction so a wrong hypothesis costs a
  reproduction step, not a wrong fix.
- **The blank tab may be fixable only in the Supabase dashboard**, in which case
  this branch ships the code half and Bjorn applies the template change.
- **Parallel sessions own Applications and the email template.** Both boundaries
  are enforced by touching neither: a redirect target and an exported pure helper.
