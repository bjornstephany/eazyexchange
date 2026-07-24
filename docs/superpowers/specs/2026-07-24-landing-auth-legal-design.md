# Landing copy, auth entry ordering, legal access — design

**Date:** 2026-07-24
**Branch:** `feature/landing-auth-legal`
**Status:** approved, implementing

Three unrelated defects on the public-facing surfaces, batched because they share
one audience: the visitor who has not signed up yet.

---

## A. Landing copy

Five strings change, in all five locales. Every one lives in `lib/landing/content.ts`,
which holds one self-contained block per locale (`fr`, `en`, `es`, `it`, `de`).

Three of the five are the `benefits.blocks[].title` fields. They shift from
*declarative outcome* ("Students complete their own files") to *imperative
instruction* ("Invite students to apply"). That is a deliberate voice change and it
is applied consistently — after this change all three titles are imperative in
every locale, including the German formal `Sie`.

| key | fr | en | es | it | de |
|---|---|---|---|---|---|
| `benefits.blocks[0].title` | Invitez les élèves à candidater | Invite students to apply | Invita a los estudiantes a presentar su candidatura | Invita gli studenti a candidarsi | Laden Sie Schüler zur Bewerbung ein |
| `benefits.blocks[1].title` | Envoyez les relances automatiquement | Send reminders automatically | Envía los recordatorios automáticamente | Invia i solleciti automaticamente | Versenden Sie Erinnerungen automatisch |
| `benefits.blocks[2].title` | Voyez tout en un coup d'œil | See everything at a glance | Ve todo de un vistazo | Vedi tutto a colpo d'occhio | Sehen Sie alles auf einen Blick |
| `savings.totalLabel` | Votre premier échange | Your first exchange | Tu primer intercambio | Il tuo primo scambio | Ihr erster Austausch |
| `slice.todoBody` | Vérifier la candidature de Yanis Meziane. | Review Yanis Meziane's application. | Revisar la candidatura de Yanis Meziane. | Verificare la candidatura di Yanis Meziane. | Die Bewerbung von Yanis Meziane prüfen. |

Terminology per locale follows what the app already uses elsewhere:
*candidature* (es/it), *Bewerbung* (de).

`slice.todoBody` stays infinitive/nominal because it renders under
« À faire maintenant » — it is a to-do item, not a sentence addressed to the reader.
Only the trailing "That's it." / « C'est tout. » is dropped.

**Explicitly unchanged:** the `body` paragraph under each benefit title, and the
`eyebrow` labels (`01 · Invitations`, `02 · Relances`, `03 · Suivi`).

**Testing:** `lib/landing/__tests__/content.parity.test.ts` already enforces that
every locale has an identical key shape and no empty strings, so a locale missed
during the edit fails the suite. No new test. Typographic apostrophes (`’`, not `'`)
must be verified after the edit — the FR/IT strings contain them.

---

## B. Auth entry ordering

Email/password comes first; Google reads as the secondary alternative; the two
pages match.

`/login` (`app/(auth)/login/page.tsx`) is **already** in the target shape:
form → « ou continuer avec » divider → `<GoogleButton label="Google" />`. No change.

`/signup` (`app/(auth)/signup/page.tsx`) is the reverse and is the only file that
changes. Target order inside `<AuthCard>`:

1. heading « Créer votre compte »
2. the `<form>` (nom complet, e-mail, mot de passe, submit)
3. divider « ou continuer avec » — replacing the current bare « ou »
4. `<GoogleButton label="Google" …>` — replacing « S'inscrire avec Google »
5. the CGU / confidentialité consent line, at the card's foot

The consent line goes last, below Google, because it governs account creation by
either method, not just the form.

`intent="organizer_signup"` and `next="/dashboard"` on `GoogleButton` are preserved
verbatim. They are load-bearing: `app/auth/callback/route.ts` signs out and deletes
the orphan auth row of any Google user with no invited profile *and* no
`organizer_signup` intent. Dropping the prop would make Google signup delete the
account it just created.

**Testing:** new `app/(auth)/signup/__tests__/page.order.test.tsx` asserting the
form's submit button precedes the Google button in DOM order, so a later edit
cannot silently flip it back.

---

## C. Legal

### C1. Legal pages must be publicly reachable — the bug

`middleware.ts` redirects any unauthenticated request whose path is not in
`isPublicRoute` to `/login`. `/legal` is not in that list, so every legal document
bounces anonymous visitors to a sign-in page.

The reported symptom (the CGU / confidentialité links on `/signup`) is one of three
affected entry points. Also broken today:

- `components/landing/LandingFooter.tsx` — all four legal links in the public footer;
- `app/billing/page.tsx:151` — the CGV link (authenticated, so it works, but it is
  the same route);
- `app/robots.ts` / `app/sitemap.ts` advertise these URLs to crawlers, which are
  anonymous and get 302'd to `/login`.

**Fix:** add `pathname.startsWith('/legal')` to the `isPublicRoute` disjunction.

`isPublicRoute` participates only in the logged-*out* gate. The logged-in redirect
branch keys off `isAuthRoute || pathname === '/'`, so authenticated users continue
to read legal pages normally — no regression there.

**Testing:** a case in `app/__tests__/middleware.test.ts` alongside the existing
`/apply/<slug>` and `/invite/<tok>` cases, asserting no redirect for a logged-out
visitor on `/legal/cgu`.

### C2. Drop the « Sommaire » nav

The link list at the top of every legal document is the
`<nav aria-label="Sommaire">` block in `components/legal/LegalDocumentView.tsx`.
It is shared by all four documents, and it is removed from all four.

Section `id` attributes stay on the `<section>` elements, so any existing deep link
(`/legal/cgv#paiement`) keeps working.

**Testing:** a case in `components/legal/__tests__/LegalDocumentView.test.tsx`
asserting the `Sommaire` nav is absent.

### C3. CGV placeholders

`lib/legal/cgv.ts` carries six `[PLACEHOLDER …]` tokens. They are not one category.

**Four are already-decided business facts published by the product itself**
(`messages/fr.json` → `organizer.billing.plans.*.price` and `organizer.billing.per`,
rendered live on `/billing`). Filling them from that source is transcription, not
invention:

| § | placeholder | value |
|---|---|---|
| 2 | Starter — prix / période | 199 € / an |
| 2 | Growth — prix / période | 399 € / an |
| 2 | Scale — prix / période | 599 € / an |
| 4 | « La facturation est [mensuelle / annuelle] » | annuelle |

Before these are written into a contractual document they are cross-checked against
the live Stripe prices (`STRIPE_PRICE_{STARTER,GROWTH,SCALE}`) via the Stripe MCP.
If Stripe disagrees with `messages/fr.json`, that discrepancy is a separate bug and
the placeholders stay untouched pending a decision.

**Related defect, fixed in the same change:** the CGV names the tiers
**Starter / Growth / Scale** — internal `PlanKey` values. Customers see
**Essentiel / Association / Réseau** (`messages/fr.json:222-224`). A contract naming
tiers that appear nowhere in the UI is a real problem; the customer-facing names are
used, with the internal key retained parenthetically only where needed for the
Stripe invoice to be reconcilable.

**Two require business/legal input and are deliberately left as placeholders:**

1. **§ 2 — HT or TTC.** Not derivable from anything in the repo; it depends on VAT
   registration status. Note that `/billing` also displays a bare « 199 € » with no
   HT/TTC mention, so whichever answer is given, that page likely needs the same
   mention added — tracked as follow-up, not done here.
2. **§ 6 — Droit de rétractation.** The clause is currently a note to itself saying
   counsel must decide. The buyers are schools and associations acting
   professionally, so the 14-day consumer withdrawal right probably does not apply —
   but a contract clause cannot rest on "probably". Needs a lawyer's sentence.

Leaving both tokens in place keeps `hasPlaceholders()` true, which keeps the amber
« brouillon » banner on `/legal/cgv`. The document therefore stays honestly marked
as a draft until they are filled — that is the intended end state of this change,
not an oversight.

### C3b. Out of scope

`lib/legal/mentions-legales.ts` (8 placeholders) and
`lib/legal/confidentialite.ts` (4) also carry blanks. Not touched here; flagged for
a separate pass.

---

## Verification

`pnpm lint`, `pnpm test`, `pnpm build`. No migration, no RLS policy and no storage
bucket is touched, so `pnpm test:rls` is not required for this change.
