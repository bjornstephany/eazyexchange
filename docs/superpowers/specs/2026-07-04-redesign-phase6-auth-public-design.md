# Redesign Phase 6 — Auth & Public Pages (screens 1a–1f)

**Date:** 2026-07-04
**Phase:** 6 of 8 (full-product FR redesign from `docs/Eazyexchange student exchange platform.zip` → `design_handoff_eazyexchange/README.md`, screens 1a–1g of `Eazyexchange Pages Round 2.dc.html`)
**Status:** Spec — awaiting plan

## Summary

Restyle the six existing auth/public/billing flows to the high-fidelity handoff design and migrate their copy to French (bilingual for the public application form). This is a **presentational + copy pass only**: every server action, data model, route, and auth flow is reused unchanged. No migration, no RLS change, no new server action → **additive**, so merge to `main` deploys to prod with **no `supabase db push`** (same shape as Phase 5).

Screen 1g (New exchange modal) is **out of scope** — already built and wired in Phase 1 (`components/shell/NewExchangeModal.tsx`). Phase 6 instead deletes the now-dead `exchanges/new` page it superseded.

## Scope

In scope — screens 1a–1f:

| # | Screen | Route / component |
|---|--------|-------------------|
| 1a | Login | `app/(auth)/login/page.tsx` |
| 1b | Signup | `app/(auth)/signup/page.tsx` |
| 1c | Accept invite (student) | `app/(auth)/accept-invite/page.tsx` |
| 1d | Public application form | `app/apply/[slug]/page.tsx` + `components/ApplicationForm.tsx` |
| 1e | Invite response | `app/invite/[token]/page.tsx` + `components/InviteResponseForm.tsx` (→ `respondToInvitation` in `@/actions/applications`) |
| 1f | Billing | `app/billing/page.tsx` |

Plus cleanup: delete `app/(organizer)/exchanges/new/page.tsx` and `components/.../NewExchangeForm.tsx` (zero references; superseded by 1g modal).

Out of scope (locked decisions):
- **1g** New-exchange modal — already shipped in Phase 1; not re-audited.
- **Transactional / reminder emails (Resend)** stay English — deferred to a later phase per the cross-phase decision. The in-app "Vérifiez votre e-mail" confirmation *screen* (HTML) IS in scope; the email it refers to is not.
- No changes to Supabase auth flows, `/auth/confirm`, `/auth/callback`, checkout/portal routes, autosave/draft logic, or `respondToInvitation` / `createExchange` internals.

## Design tokens (already in place)

Phase 1 remapped shadcn CSS vars to the handoff palette (Approach A) and loaded the fonts. Reuse existing Tailwind/shadcn tokens and fonts; do **not** introduce new global tokens. Key values (from README, for reference only):

- Canvas `#EEF1F7`; card border `#E4E9F2`; input border `#C4CDE0`, focused 2px `#2456E6`; primary blue `#2456E6` / hover `#1D48C7`; ink `#10203F`; secondary text `#5B6B8C`; danger text `#C0392B`; blue tint bg `#E6ECFD` / border `#C8D6FA` / text `#1D48C7`; success bg `#DCF3E6` / text `#0F7A3D`; warning bg `#FCF0DB` / text `#9A6B15`.
- Radii: cards 18px, inner 14–16px, inputs 10–11px, buttons 9–11px, pills 999px.
- Floating card shadow `0 18px 40px -30px rgba(16,32,63,.25)`.
- Headings Schibsted Grotesk 700 (−0.02em); body IBM Plex Sans; micro-labels/status IBM Plex Mono uppercase.

Where a token is missing at the shadcn layer, use a local Tailwind arbitrary value matching the hex above rather than adding a global token.

## Architecture

### New shared primitive — `components/auth/CenteredCard.tsx`

Presentational wrapper for the common centered-card layout (1a, 1c, 1e, 1f). Props:

- `maxWidth: number` (460 for 1a/1c, 520 for 1e, 640 for 1f)
- `children` (the card body)

Renders: full-height `#EEF1F7` viewport, centered column, `Logo` (with wordmark, ~23px) above, then a white card (`radius:18`, `border:#E4E9F2`, floating shadow, padding ~36×42) at `maxWidth`. No client state — pure layout. Reuses existing `components/brand/Logo.tsx`.

1b (signup) does **not** use `CenteredCard` directly: it renders a two-column grid (gap 60, stacks < ~900px) — left 340px navy brand panel (logo, H3 30px, body, mono `ESSAI GRATUIT · 1 ÉCHANGE`) + right 460px card with the same white-card styling. Extract the white-card visual into `CenteredCard` such that 1b can reuse the inner card look (either compose `CenteredCard` inside the grid's right column, or share a lower-level `AuthCard` sub-component — implementer's call at plan time, but avoid duplicating the card chrome).

1d (apply) is **not** a card layout — it keeps its own 720px column with a header row and sticky bottom bar (see 1d below).

### Per-screen detail

**1a Login** — `CenteredCard maxWidth=460`. H3 24px « Connexion »; `GoogleButton` (label « Continuer avec Google »); mono divider « ou »; E-mail + Mot de passe inputs (50px); primary full-width « Se connecter » (busy « Connexion… »). URL-flag errors render as 14px `#C0392B` above the button — migrate the four existing English strings to French, keyed on the same flags (`invite_invalid`, `oauth_failed`, `not_invited`, `signup_failed`). Reuse `supabase.auth.signInWithPassword`.

**1b Signup** — two-column layout above. Right card: H3 22px « Créer votre compte »; Google « S'inscrire avec Google »; divider; 2-col grid Nom complet / Établissement; then E-mail, Mot de passe (placeholder « 8 caractères minimum », `minLength=8`); primary « Créer mon compte » (busy « Création… »). Submitted state reuses the card with « Vérifiez votre e-mail » (use existing confirm copy). Reuse the existing signup server action / supabase call unchanged.

**1c Accept invite** — `CenteredCard maxWidth=460`. Blue-tint pill with exchange name; H3 24px « Configure ton compte » + sub « Dernière étape avant ton espace élève. »; Google « Continuer avec Google »; divider « ou choisis un mot de passe »; Nom complet + Mot de passe (46px); primary « C'est parti » → `/my-forms`. Tutoiement. Reuse existing invite-accept flow.

**1d Public application form** — restyle `components/ApplicationForm.tsx` (client) + its `app/apply/[slug]/page.tsx` shell. 720px column, top padding 52px. Header row: `Logo`+wordmark 17px left; right = mono autosave indicator (`ENREGISTRÉ ✓` / `ENREGISTREMENT…`, wired to the existing debounced autosave state) + **EN/FR segmented toggle** (active segment navy bg / white text) driving the existing `lang` state. Blue pill « Candidature »; H3 30px exchange name; intro. Form card (radius 18, top corners only). Each section: header row — mono blue `n/4` + 19px title — 2-col field grid (gap 16), required `*`, focused field 2px blue border. Bilingual field content already exists in `lib/application-form.ts` (`{en, fr}`) — **no new translation strings**. **Sticky bottom bar** (white, top border): ghost « Terminer plus tard » (existing `onFinishLater` / resume-link) + primary « Envoyer ma candidature ». Closed/invalid-slug states use the 2c template (Phase 7 — for now keep existing behavior, restyle minimally).

**1e Invite response** — restyle `InviteResponseForm` in `CenteredCard maxWidth=520`. Success pill « Candidature acceptée 🎉 » (green tint); H3 26px « {Prénom}, tu es invitée à l'échange {nom} ! »; body « Ta candidature a été retenue. Veux-tu participer ? »; primary full-width « Oui, je veux participer » + secondary « Non merci »; divider; optional note textarea (placeholder « Si tu hésites, laisse une note (facultatif) ») + underlined ghost « Peut-être — j'ai besoin de temps ». Reuse `respondToInvitation` and existing post-response confirmation copy. Status-pill palette per README (Acceptée=success, Envoyée=blue tint, Peut-être=warning, Refusée=danger, Brouillon=neutral).

**1f Billing** — restyle `app/billing/page.tsx` in `CenteredCard maxWidth=640`. H3 24px « Offres & facturation » + trial line « Vous êtes en essai gratuit (1 échange)… ». 3-col plan grid (gap 14): Starter — 2 échanges, Growth — 6 échanges (**pre-selected**: 2px blue border, bg `#F7F9FE`, floating `POPULAIRE` mono pill), Scale — Échanges illimités. Footer: primary flex-1 « Continuer avec {plan} » → `/billing/checkout?plan=` + ghost « Retour au tableau de bord ». Active-subscription state: replace grid with current-plan sentence + « Gérer la facturation » (Stripe portal); grace-period warning in `#C0392B`. Reuse existing billing routes + `lib/billing/limits`. Plan caps must match billing source of truth (Trial 1 / Starter 2 / Growth 6 / Scale unlimited).

### Interactions (README §Interactions)
- Primary hover → `#1D48C7`; white buttons hover `#F5F7FC`; rows hover `#F7F9FE`. Busy states swap label + disable.
- No entrance animations on these screens.
- All error strings: 14px `#C0392B` inside the relevant card.

## Data flow

No change. State reuse per README §State Management:
- 1a–1c: existing Supabase auth calls.
- 1d: existing `ApplicationForm` autosave/draft/submit + resume-link (`onFinishLater`), 800ms debounce, `lang` state, `lib/application-form.ts` sections.
- 1e: `respondToInvitation`.
- 1f: existing checkout/portal routes + `lib/billing/limits`.

No new props that require new data. No new env vars.

## Error handling

Preserve existing error semantics; only the *presentation* (14px danger text in-card) and *copy* (French) change. Login keeps flag-keyed messaging. Supabase / action errors surface as before, restyled.

## Testing

- Unit (Vitest): `CenteredCard` renders logo + card at given `maxWidth`; per-screen copy assertions (French strings present, correct error-flag mapping on 1a, Growth pre-selected on 1f, EN/FR toggle switches `ApplicationForm` labels). Follow the Phase 5 test pattern; keep/extend existing tests in `app/(auth)/__tests__` and component `__tests__`.
- Gates: `pnpm lint`, `pnpm test` (all green, no regressions), `pnpm build` (tsc + build). Locally use `tsc --noEmit` where `.env.local` placeholders block `pnpm build`.
- Live drive (user-gated, optional): real browser only — login + signup are public and drivable; invite/apply/billing need real tokens/session, so drive the real browser and verify via read-only MCP SQL. **Never build a prod curl harness** (Phase 4 lesson). Additive/low-risk like Phase 5, so a live drive may be deferred at the user's discretion.

## Gotchas / lessons carried in

- **U+2019 apostrophe:** the Write tool converts U+2019 → ASCII `'`. Transcribe copy from the **`Eazyexchange Pages Round 2.dc.html` source bytes**, not from this spec (whose apostrophes are already ASCII-flattened). After every file write containing French strings with typographic apostrophes (« C'est parti », « d'échanges », « l'échange »…), verify the apostrophe bytes against the HTML and fix if the tool flattened them.
- Match handoff copy **verbatim** including « » guillemets and accents.
- Additive change → merge = prod deploy, **no `supabase db push`**. Confirm `git diff --stat` shows no migration before merge.
- PII: implementers stage only named files (no `git add -A`) — apply pages can leave untracked student artifacts.

## Build approach

Subagent-driven-development, matching Phase 5 and CLAUDE.md token-hygiene guidance: transcription-tier implementers (plan carries complete code), per-task reviews, opus final review before merge. File-based handoffs (briefs/reports) so execution is resumable from disk. Finalized in the plan.

## Deliverables

- `components/auth/CenteredCard.tsx` (+ test)
- Restyled + FR: `login`, `signup`, `accept-invite` pages; `ApplicationForm` + `apply/[slug]`; `InviteResponseForm` + `invite/[token]`; `billing` page.
- Deleted: `app/(organizer)/exchanges/new/page.tsx`, `NewExchangeForm.tsx`.
- Updated/added tests; all Verifying-Changes gates green.
