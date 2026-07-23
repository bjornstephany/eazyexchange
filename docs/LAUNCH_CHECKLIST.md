# EazyExchange — Production Launch Checklist

Tracks what stands between the current state and a public launch. As of **2026-07-04**, the full product is built and the 8-phase redesign is merged + deployed to prod. What remains is **external config wiring** — features whose code is live but sit inert until the dashboards/env vars below are set — plus optional polish.

Check items off as you complete them. Detailed step-by-steps live in the linked setup docs; this file is the index + gate.

Prod domain: **eazyexchange.vercel.app** · Vercel project `eazyexchange` · Supabase project (see `.env.local` / dashboard).

Owner legend: 🧑 = Bjorn (dashboard/manual only he can do) · 🤖 = Claude can do or assist.

---

## 🚦 Go-live gate

Do **not** consider the app publicly launchable until every **Blocker** below is checked. Optional items can trail launch.

- [ ] All four blockers below complete and verified in prod
- [ ] One full real-user smoke test in an incognito window: signup → confirm email → create exchange → send application link → (as student) apply → (as organizer) accept → fill a form → approve
- [ ] `/billing` checkout completes end-to-end with a real Stripe test/live card and the webhook flips the school's `subscription_status`

---

## 🔴 Blockers (payments & auth are broken until these are done)

### 1. Stripe billing activation 🧑 (+🤖 to verify)
Billing code is deployed and inert; migration `20260701000002` is applied. Nothing charges until Stripe is wired. Detailed guide: [`docs/stripe-billing-setup.md`](./stripe-billing-setup.md). Architecture recap in `CLAUDE.md` → "Billing".

- [ ] Stripe account verified (business details, able to accept live payments)
- [ ] Create **3 yearly Prices in EUR** (must be EUR at go-live):
  - [ ] Starter — **199 €/an** → cap **2 exchanges**
  - [ ] Growth — **399 €/an** → cap **6 exchanges** (marked POPULAIRE in UI)
  - [ ] Scale — **599 €/an** → **unlimited exchanges**
- [ ] Set env vars in Vercel (Production): `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_SCALE`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- [ ] Register the prod webhook → endpoint `https://eazyexchange.vercel.app/api/stripe/webhook`, subscribed to: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Set `STRIPE_WEBHOOK_SECRET` (from the created webhook) in Vercel
- [ ] **Verify:** run a checkout on `/billing`; confirm the webhook fires and the school row's `subscription_status`/`plan` update (webhook is the only writer). Confirm the exchange cap now reflects the plan.

### 2. Google sign-in activation 🧑
Migration + app code deployed 2026-07-01. Buttons **error** until the provider is enabled. Detailed guide: [`docs/google-auth-setup.md`](./google-auth-setup.md).

- [ ] Enable the **Google provider** in Supabase Auth (client ID/secret from Google Cloud console)
- [ ] Add `/auth/callback` redirect URL(s) for prod (`https://eazyexchange.vercel.app/auth/callback`) and any preview origins
- [ ] Turn on Supabase's **"link accounts with the same email"** setting (required — see the setup doc)
- [ ] **Verify (browser E2E):** organizer "Continue with Google" signup creates a school; an invited student "Continue with Google" signs in; a Google user with **no** invite and no `intent=organizer_signup` is signed out + orphan auth row deleted (invite-only enforcement in `app/auth/callback`)

### 3. Supabase Auth Site URL 🧑
If left at localhost, email confirm/invite/magic-link links point to localhost and break for real users.

- [ ] Set Auth **Site URL** to `https://eazyexchange.vercel.app`
- [ ] Keep `http://localhost:3000` in **Additional Redirect URLs** (for local dev)
- [ ] Confirm the invite email template targets `/auth/confirm` (POST `/verify`, not GET — see project notes)
- [ ] **Verify:** trigger an organizer signup + a student invite; click both email links from a real inbox and confirm they land on prod and establish a session

### 4. Resend email deliverability 🧑
Reminders + transactional email won't reliably deliver from an unverified domain.

- [ ] Verify the sending **domain** in Resend (DNS records)
- [ ] `RESEND_API_KEY` set in Vercel prod (key was rotated 2026-06-28)
- [ ] `EMAIL_FROM` set as **`Name <mailbox@domain>`** (not a bare domain)
- [ ] **Verify:** an invite email and a reminder email arrive in a real inbox (not spam) with the correct from-name

---

## 🟡 Optional / post-launch (non-blocking)

- [ ] **French emails** 🤖 — reminder + transactional emails are still **English** (the one deferred redesign decision). A small follow-up phase gets full FR parity. See redesign cross-phase "Open item".
- [ ] **Landing testimonial** 🤖 — currently a generic placeholder ("Coordinatrice d'échanges / Association d'échanges scolaires") from the design. Swap for a real quote or remove before promoting the site. Edit in `lib/landing/content.ts` (`testimonial`, both `fr` and `en`).
- [ ] **Leaked-password check (HIBP)** 🤖 — Supabase's built-in check is Pro-tier; self-implement via the HIBP range API in the signup/password-set flow if wanted.
- [ ] **Legacy Tailwind tokens** 🤖 — retire `cleared/boarding/stamp/paper` (still consumed by `FormBuilder.tsx` / `app/layout.tsx`) once those are migrated.
- [ ] **Deferred per-phase minors** 🤖 — small non-blocking items logged in `.superpowers/sdd/progress.md` (e.g. `getStudentContext` double-fetch → `cache()` dedupe, a few ARIA / `<a>`-vs-`Link` nits, `PlanSelector` ARIA radio). Low priority.

---

## Reference docs
- [`docs/DEPLOY.md`](./DEPLOY.md) — deploy process
- [`docs/stripe-billing-setup.md`](./stripe-billing-setup.md) — full Stripe wiring
- [`docs/google-auth-setup.md`](./google-auth-setup.md) — Google OAuth provider config
- `CLAUDE.md` — architecture, gotchas, billing/auth/reminders overview
- `.superpowers/sdd/progress.md` — redesign execution ledger + deferred minors (local, gitignored)
