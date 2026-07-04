# Redesign Phase 7 — System States (2a–2f) — Design Spec

**Date:** 2026-07-04
**Phase:** 7 of 8 (full-product FR redesign from the `design_handoff_eazyexchange` handoff)
**Source of truth:** `design_handoff_eazyexchange/README.md` §"Screens — System States" + `Eazyexchange System States.dc.html` (screens 2a–2f)
**Predecessor:** Phase 6 (auth/public pages 1a–1f) — merged `e75b666`, prod 2026-07-04.

## Summary

Bring the six "system state" screens to design fidelity + French copy: loading (2a), error (2b), invalid/expired link (2c), Stripe billing return (2d), organizer empty state (2e), student empty state (2f). Every target file already exists in functional form — this is a **restyle + French pass**, not new plumbing.

## Global constraints (binding)

1. **Additive / no data change.** No migration, no RLS change, no server-action signature change, no new server-action. Merge to `main` = Vercel prod deploy with **no `supabase db push`** (same as Phases 5 & 6).
2. **French copy, exact bytes.** All new/changed copy is French. Applicant/student-facing states use **tutoiement**; organizer-facing states use **vouvoiement**. Apostrophes must be the curly U+2019 (’) byte, not ASCII `'`. The Write tool downgrades U+2019→ASCII — every FR-string file write must be followed by an apostrophe-repair + accent-presence check (see [[french-transcription-pitfalls]] and the Phase 6 ledger guard).
3. **Animations live in `app/globals.css`** as `@keyframes` (matching the existing `manifest-*` / `drwIn` convention). No new animation dependency (no framer-motion). Only 2a and 2d use motion.
4. **No new assets.** Brand mark is CSS/SVG. Reuse `components/brand/{Mark,Logo}.tsx` where the mark is static; 2a needs a bespoke per-circle-animated mark (see 2a).
5. **Tokens, not hex, in new Tailwind classes** where a token exists (`navy`, `brand`, `muted-foreground`, `tint`, `tint-border`, `success`, `danger-text`, `subtle`, `placeholder`, …). Raw hex only where a design value has no token (e.g. the 2b dashed-line `#AEB7CB`, skeleton shimmer stops), consistent with existing Phase 3–6 files.
6. **Shell stays put during nav.** `loading.tsx` / `error.tsx` render inside the already-resolved organizer/student layout (the shell), so 2a/2b fill the **content area**, not the full viewport (see 2a deviation note). Do not hoist them above the layout.

## Decisions locked (do not re-ask)

- **2c contact button DROPPED.** Invalid/expired states are text-only (heading + body), no « Contacter l’organisateur » button. This removes the need to surface organizer email in public token contexts — **zero data-layer change**. (User decision, 2026-07-04.)
- **2f copy: keep Phase-5 shipped copy for the *done* states**, add the *empty* state. « Ton dossier est complet » (all approved) and « Tout est envoyé » (all in review) stay. The handoff’s 2f « Tout est à jour » banner + body maps to the genuinely-**empty** `total===0` case (student invited, no assignments yet), which currently renders a blank page. (User decision, 2026-07-04.)
- **2d kept presentational.** We have exactly one backend signal (`hasActivePlan` → redirect). The three step rows render in their drawn default state; no per-step progress is faked; `ReturnPoller` logic is unchanged. (User decision, 2026-07-04.)

---

## 2a · Loading — `components/LoadingState.tsx` (rebuild)

**Files:** `components/LoadingState.tsx` (rebuild), `app/globals.css` (+keyframes). `app/(organizer)/loading.tsx` and `app/(student)/loading.tsx` keep delegating to `<LoadingState />` unchanged.

**Layout:** centered column, `gap` 30px, on `bg-background` (`#EEF1F7`), **filling its container** (`min-h-[60vh]` or similar so it reads as full-height within the shell). Elements top→bottom:
1. **Animated mark**, 80×60 box: two circles (48px design → scale to box) that swap positions. Bespoke markup (two absolutely-positioned circles) — **not** the shared `Mark` SVG, because each circle animates independently. Navy `#10203F` circle animates `ee-mark-l`; blue `#2456E6` circle animates `ee-mark-r`; both 1.6s `cubic-bezier(.45,0,.25,1)` infinite. At the 50% keyframe each translates ±(≈15px,≈7px) scaled to mark size (swap), then back.
2. **Wordmark** « Eazyexchange », 28px, Schibsted Grotesk 700, navy.
3. **Indeterminate bar:** 220×5px track `bg-[#DDE3EF]` rounded-pill, an 80px `bg-brand` segment sliding left→right via `ee-indeterminate` 1.1s `cubic-bezier(.4,.1,.6,.9)` infinite (translateX(−64px)→translateX(168px), proportional to track).
4. **Mono caption** 14px `text-placeholder` (`#8A97B2`): « CHARGEMENT DE VOTRE ESPACE… » (IBM Plex Mono, uppercase).

**⚠ Deviation by necessity (approved):** the handoff calls 2a "full-viewport", but route-level `loading.tsx` renders inside the resolved shell layout, so this is a **content-area** loader. `min-h` fill approximates the design within the shell. Not hoisted above the layout (shell must persist during nav).

**Keyframes added to `globals.css`:** `ee-mark-l`, `ee-mark-r`, `ee-indeterminate`.

---

## 2b · Error — `components/ErrorState.tsx` + `app/(organizer)/error.tsx` + `app/(student)/error.tsx`

**Files:** `components/ErrorState.tsx` (restyle + `home` prop + FR `friendlyMessage`), both `error.tsx` (pass `home`).

**`ErrorState` new signature:**
```ts
export function ErrorState({
  error, reset, home,
}: { error: Error; reset: () => void; home: { href: string; label: string } })
```
- `app/(organizer)/error.tsx` → `home={{ href: '/dashboard', label: 'Tableau de bord' }}`
- `app/(student)/error.tsx` → `home={{ href: '/my-forms', label: 'Mon dossier' }}` (student home is the dossier, not a "dashboard")

**Layout:** centered content-area column. Broken-link motif: navy circle 48px — 96px dashed line 3px `#AEB7CB` — blue circle 48px (horizontal row). Then:
- H3 36px Schibsted, navy: « Le fil s’est rompu. »
- Body 18px `text-muted-foreground` (`#5B6B8C`), max-width 520px, centered: use `friendlyMessage(error.message)` for the mapped line; the design’s generic line is « Une erreur est survenue de notre côté — vos données sont en sécurité. Réessayez, ou revenez au tableau de bord. »
- Buttons row: **primary** « Réessayer » (calls `reset()`) + **secondary** `home.label` linking to `home.href`.

**`friendlyMessage()` → French** (keep the mapping, translate values):
| `error.message` | French |
|---|---|
| `Unauthorized` | « Vous n’avez pas accès à cette page. » |
| `Unauthenticated` | « Votre session a expiré. Reconnectez-vous. » |
| `Exchange not found` / `Assignment not found` | « Nous n’avons pas trouvé ce que vous cherchiez. » |
| default | « Une erreur est survenue de notre côté — vos données sont en sécurité. Réessayez, ou revenez au tableau de bord. » |

(Vouvoiement is acceptable here even on the student error boundary — the mapped messages are generic system errors; the design body copy is vouvoyed.)

---

## 2c · Invalid / expired link — new `components/InvalidLinkState.tsx`

**Files:** new `components/InvalidLinkState.tsx`; wire into `app/apply/[slug]/page.tsx`, `app/apply/resume/[token]/page.tsx`, `app/invite/[token]/page.tsx`.

**Component (presentational, server-safe):**
```ts
export function InvalidLinkState({ title, body }: { title: string; body: string })
```
- Centered column on `bg-background`. **Greyed-out logo:** the two mark circles in `#9AA6C0` (top) + `#C4CDE0` (bottom, `mix-blend-multiply`), 55% opacity, ~64×48. (A `variant="muted"` on `Mark`, or a local muted mark — implementer’s call; keep it simple.)
- H3 32px Schibsted, navy: `title`.
- Body 17px `text-muted-foreground`, max-width ~520px, centered, tutoiement: `body`.
- **No button** (decision locked).

**Branch → copy map** (replace the current one-line `<p>` in each). The expired/invalid default reuses the handoff verbatim:

| Route / branch | title | body |
|---|---|---|
| resume: invalid token; invite: invalid token; apply: unknown slug | « Ce lien n’est plus valide » | « Il a peut-être expiré — c’est normal, les liens expirent pour protéger ton dossier. Vérifie l’adresse dans ton e-mail, ou demande à ton organisateur de t’en renvoyer un nouveau. » |
| resume: expired | « Ce lien a expiré » | « Les liens de candidature expirent au bout d’un moment pour protéger ton dossier. Demande à ton organisateur de t’en renvoyer un nouveau. » |
| invite: expired | « Cette invitation a expiré » | « Contacte ton organisateur pour recevoir une nouvelle invitation. » |
| invite: already-answered (closed) | « Cette invitation a déjà reçu une réponse » | « Tu as déjà répondu à cette invitation. Si c’est une erreur, contacte ton organisateur. » |
| apply: closed | *keep the existing exchange-name heading + closed sentence* (NOT the invalid template — this is a valid exchange with closed applications; leave `app/apply/[slug]` closed branch as-is or lightly restyle to match, at implementer discretion) | « Les candidatures sont actuellement fermées pour cet échange. » |
| resume: submitted | *keep the existing exchange-name heading + « Ta candidature a déjà été envoyée… » success line* (this is a positive terminal state, not an invalid link) | — |

Note: `apply` closed and `resume` submitted are **valid, positive** terminal states — they keep their exchange-name heading and are NOT routed through `InvalidLinkState`. Only the genuinely-invalid/expired/already-answered branches use the greyed template.

---

## 2d · Billing return — `app/billing/return/page.tsx` (restyle)

**Files:** `app/billing/return/page.tsx` (restyle). `ReturnPoller.tsx` **unchanged** (keeps `router.refresh()` poll → server redirects on `hasActivePlan`). Server-side gate (`getUser` → school → `hasActivePlan` → `redirect('/dashboard')`) unchanged.

**Layout:** centered on `bg-background`: logo+wordmark 24px, then white card 560px (radius 18, padding 34×40) with **3 step rows** (gap 26px):
1. ✓ green disc 36px (`bg-success` / `text-success-text` `#0F7A3D`) — « Paiement reçu » (600).
2. Spinner 36px (3.5px ring `#C8D6FA`, top arc `bg-brand`/`#2456E6`, `ee-spin` 0.9s linear infinite) — « Activation de votre abonnement… » (600).
3. Empty 36px circle 2px `#C4CDE0`, whole row at 55% opacity — « Redirection vers le tableau de bord ».

Below the card, mono 14px `text-placeholder`: « Vous serez redirigé automatiquement — ne fermez pas cette page. »

**Keyframes added:** `ee-spin`. **⚠ Presentational (approved):** rows render in this drawn default state; poll→redirect fires unchanged.

---

## 2e · Organizer empty state — `components/dashboard/EmptyDashboard.tsx` (restyle)

**Files:** `components/dashboard/EmptyDashboard.tsx` (restyle). Keeps `'use client'` + `useShellUi().openNewExchange` wiring.

**Layout:** page H3 30px Schibsted navy « Tableau de bord » at top, then a **2px dashed `#C4CDE0`** zone (radius 22, padding 64×40, `bg-[rgba(255,255,255,.5)]`), centered column inside:
- Logo (static `Mark` + wordmark or `Logo`), ~64×48.
- Title 24px Schibsted navy: « Aucun échange pour l’instant ».
- Body 17px `text-muted-foreground`, max-width 480px: « Créez votre premier échange pour inviter des élèves, assigner des formulaires et suivre les dossiers au même endroit. »
- Primary button « + Nouvel échange » → `openNewExchange` (opens the 1g modal). Unchanged behavior.

---

## 2f · Student empty state — `components/student/DossierView.tsx`

**Files:** `components/student/DossierView.tsx` (add `total===0` branch; align done-state banners to the 2f blue-tint spec). No change to `lib/student/dossier.ts` data shape.

**Add the missing `total === 0` branch** (student invited but no assignments yet — currently renders header only, blank body). After the existing header (kicker « MON DOSSIER » + « Bonjour {firstName}, » + subline), render the **2f blue-tint banner**:
- Banner: `bg-tint` (`#E6ECFD`) / `border-tint-border` (`#C8D6FA`), radius 22, padding 30×34.
- 66px `bg-[#1D48C7]` rounded-18 square with white ✓.
- Title 22px navy: « Tout est à jour ».
- Body 16px, tutoiement: « Aucun formulaire ne t’attend pour l’instant. On te préviendra par e-mail dès qu’il y a du nouveau — profite de ta journée. »
- **No progress bar** when `total===0` (nothing to measure) — keep the existing `total>0` gate on the progress row.

**Done-state banners (`allApproved` / `allSent`):** keep the Phase-5 copy (« Ton dossier est complet » / « Tout est envoyé ») and their bodies. Optionally align their visual to the 2f banner spec (blue-tint 66px square, 22px title) for consistency — they already use `bg-tint`/`border-tint-border`; bringing the icon tile + title sizing in line is a light touch, not a copy change.

---

## Testing

**Vitest (unit):**
- `LoadingState` renders the caption « CHARGEMENT DE VOTRE ESPACE… ».
- `ErrorState`: renders the mapped FR message for a known `error.message`, the default FR line otherwise, and the `home` button with correct `href` + `label` (assert both organizer and student wirings).
- `InvalidLinkState` renders the passed `title` + `body`.
- `DossierView`: `total===0` renders the « Tout est à jour » empty banner and **no** progress bar; existing done/todo/review tests stay green.
- `EmptyDashboard`: behavior unchanged (button triggers `openNewExchange`).

**Not unit-tested (visual only):** the 2a/2d animations (keyframes), motif/spinner geometry.

**Live drive (manual, post-build):** force an error boundary (throw in a page) → 2b; hit a bad/expired token → 2c; a zero-exchange organizer → 2e; a no-assignment student → 2f; observe 2a during a slow nav and 2d on the billing return path.

**Verifying gates (must pass before merge):** `pnpm lint`, `pnpm test`, `npx tsc --noEmit`, `pnpm build`, apostrophe-byte audit on every changed FR file.

## Out of scope

- Reminder/transactional **emails remain English** (cross-phase open item, decided in a later phase).
- No change to `ReturnPoller` polling logic, billing gate, or any server action.
- Landing page (Phase 8).

## Deferred / accepted minors (for final review, non-blocking)

- 2a content-area (not full-viewport) loader — approved deviation.
- 2d presentational steps (single backend signal) — approved.
- `friendlyMessage` uses vouvoiement even on the student error boundary — acceptable (generic system errors).
- 2f done-state banner visual alignment is optional polish, not required for approval.

## Cross-references

- [[redesign-phases]] — phase ledger; update the Phase 7 line to DONE after merge.
- [[french-transcription-pitfalls]] — apostrophe/accent guard for FR-string files.
- `.superpowers/sdd/progress.md` — append a Phase 7 execution entry.
