# Settings audit — design

Date: 2026-07-24
Branch: `feature/settings-audit`

Six unrelated defects and decisions across the organizer Settings page and the
sidebar exchange list. They share no code, so they ship as one branch of small
independent changes rather than one feature.

## Findings that shaped the design

**The school lock already exists, FR-only.** `feature/school-registry-signup-gate`
merged to `main` in `13d0abc`, and its "closing the settings back door" decision is
live: `updateProfile` ignores a submitted school name when `schools.country === 'FR'`,
`ProfileCard` renders the field read-only, and `settings-school-name-lock.test.ts`
covers it. There is nothing to fold in and nothing to collide with. The gap is that a
non-FR owner can still rename, because non-FR schools are typed free-text at
onboarding rather than claimed from `school_registry`.

**Every password-change failure is invisible in production.** `changePassword` throws
on all four expected outcomes — wrong current password, too short, leaked, rate
limited. CLAUDE.md's own rule is that production replaces thrown Server Action
messages with an opaque digest, and `SecurityCard` renders `err.message` directly.
So in prod the user sees a digest string for every failure. The four messages are
also hardcoded French, untranslated in the other four locales.

**The billing lookup can miss a real card.** `getBillingOverview` reads only
`customer.invoice_settings.default_payment_method`, but `app/billing/checkout/route.ts`
never sets that field — Checkout attaches the card to the subscription. A paying
customer can therefore be told "no payment method", offered "Add a card", and sent to
`/billing`, which is the plan-selection page. That is the double-subscription path the
billing upgrade work was built to avoid. (The live Stripe account has zero
subscriptions, so which field Checkout populates could not be confirmed empirically;
reading both is correct either way.)

**The drag transform is unclamped on Y.** `ExchangeList.tsx` applies dnd-kit's raw
`transform.y`; only the X component is dropped. A row can be dragged downward without
limit and upward past the "Mes échanges" header.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Organizer **can** edit their own full name | It is their own display name, typed at signup; typos and name changes are normal. Nothing downstream treats `full_name` as an identity claim — the audit log keys on user id. Add a length cap; it is currently unbounded and lands in email HTML as the inviter name. |
| 2 | School name is read-only for **every** country | One rule, no exceptions. Removes the last client write path to `schools.name`. The security argument only ever applied to FR, but a field that is editable for some organizers and not others is the confusing outcome. Cost accepted: a non-FR organizer with a typo needs support. |
| 3 | Billing row never links to `/billing` | Trial: no button, note only. Subscribed: portal. Kills the mislabelled CTA and the second-subscription path in one change. |

## §1 — Profile card

`updateProfile` takes `{ fullName }`. The school-rename branch is **deleted**, not
widened — there is then no client write path to `schools.name` at all. The
`schoolCountry` prop threaded `page.tsx → SettingsView → ProfileCard` becomes dead
and is removed.

The school name still displays (read from `profile.schools.name`), permanently
read-only. The existing `settings.profile.schoolNameLockedHint` string is reused for
every country, so its copy needs rewording in 5 locales — today it attributes the
lock to the French registry, which is no longer the reason.

Full name: trim, non-empty, max 120 characters. `updateProfile` returns
`{ ok: true } | { ok: false; message: string }` for the same reason as §2 — it throws
today, so an empty name reports a digest in production. `ProfileCard` reads
`result.message`.

`actions/__tests__/settings-school-name-lock.test.ts` is rewritten: the "still renames
a non-FR school" case inverts to "never writes `schools`, for any country".

**Not doing:** revoking the `schools.name` column grant from `20260701000001`. Real
defence-in-depth, but it costs a migration in a single-writer directory, a
staging-then-prod apply and a `pnpm test:rls` cycle, to close a path the server action
no longer exposes. Goes to `BACKLOG.md`.

## §2 — Password change

### Fix the reporting

`changePassword` returns `{ ok: true } | { ok: false; message: string }`, following the
`updateGoodNewsTemplate` precedent in the same file. Expected outcomes travel as
return values; only genuinely unexpected failures throw. `SecurityCard` reads
`result.message`.

Supporting changes, both additive so no other caller moves:

- `lib/auth/hibp.ts` gains `passwordPolicyIssue(pw): 'too_short' | null`.
  `passwordPolicyError` stays as a thin wrapper over it, so `actions/join.ts` and
  `lib/auth/__tests__/hibp.test.ts` are untouched.
- `lib/rate-limit.ts` exports its existing private `checkRateLimit`, so a caller
  wanting a structured result can map `'limited'` itself instead of catching a throw.
  No behaviour change to `enforceRateLimit` / `enforceRateLimitStrict`.

New `settings.errors.*` keys in 5 locales for: current password incorrect, password
too short, password leaked, too many attempts. These replace the hardcoded French
strings at the `changePassword` call sites — `PWNED_MESSAGE` and the
`passwordPolicyError` string themselves stay put for `join.ts`.

### Then verify it end to end

Unit tests prove the branches; they cannot prove the success path. Run it for real on
staging with the seeded organizer, per `reference_visual_check_via_staging_playwright`:

1. Change the password from Settings.
2. Confirm the session survives the `updateUser` token rotation. This is the genuinely
   uncertain part: `lib/supabase/server.ts` writes refreshed cookies through a
   `setAll` wrapped in a bare `try {} catch {}`, so a failure here is silent.
3. Log out, log back in with the new password.

If the session drops or the new password does not take, that is the actual defect and
it gets fixed under this item.

**Out of scope, backlogged:** `actions/join.ts` has the same throw-in-production bug on
its password-set path.

## §3 — Confirm-password label

`settings.security.confirmPasswordLabel` in all five locales:

| Locale | From | To |
|--------|------|-----|
| en | Confirm | Confirm new password |
| fr | Confirmer | Confirmer le nouveau mot de passe |
| es | Confirmar | Confirmar la nueva contraseña |
| de | Bestätigen | Neues Passwort bestätigen |
| it | Conferma | Conferma la nuova password |

The three password fields sit in a `sm:grid-cols-3`. The longer labels wrap in some
locales, which knocks the inputs out of horizontal alignment. Pin a min-height on the
label so all three rows stay level; confirm visually.

## §4 — Billing payment row

`getBillingOverview` retrieves the Stripe customer expanding **both**
`invoice_settings.default_payment_method` and
`subscriptions.data.default_payment_method`, preferring the former and falling back to
the latter. One API call, robust to whichever field Checkout populates.

The `/billing` href leaves this row entirely:

- **No active plan (trial):** no button. Note only — the payment method is collected
  when a plan is chosen. The "View plans" CTA in the card header already carries that
  action.
- **Active plan:** "Modifier" → `/billing/portal`, whether or not a card was found.

The `billing.payment.addCta` string is retired.

## §5 — Sidebar drag bounds

Add `@dnd-kit/modifiers`; pass `modifiers={[restrictToVerticalAxis, restrictToParentElement]}`
to the `DndContext`. The hand-rolled `translate3d(0, …)` is deleted —
`restrictToVerticalAxis` does that job properly, and `restrictToParentElement` clamps
travel to the rows' container, which begins below the "Mes échanges" header and ends at
the last row. Both bounds, one change.

The alternative of clamping by hand — which the current code comment argues for, to
avoid a third dnd-kit package — requires assuming a fixed row height to compute the
travel range, and rows are not uniform: archived exchanges carry an extra badge.

## Verification

`pnpm lint`, `pnpm test`, `pnpm build`. No migrations, so no `pnpm test:rls`.

One staging browser run covers §2's real question, §3's label alignment and §5's drag
bounds together.
