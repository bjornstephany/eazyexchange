# Key rotation runbook

Goal: any key rotates in ~15 minutes with zero downtime. Universal order:
**create new → set in every consumer → redeploy/verify → revoke old.** Never
revoke first. Worked example: the 2026-06-28 emergency rotation (exposed
service-role JWT + Resend key) followed exactly this order — this document
turns it into a drill.

## Where each secret lives

| Secret | Issued by | Consumed by |
|---|---|---|
| SUPABASE_SERVICE_ROLE_KEY (sb_secret_…) | Supabase → Settings → API keys | Vercel env (all envs), `.env.local` |
| NEXT_PUBLIC_SUPABASE_ANON_KEY (sb_publishable_…) | Supabase → Settings → API keys | Vercel env, `.env.local` (baked into browser bundle) |
| RESEND_API_KEY | Resend → API Keys | Vercel env, `.env.local` |
| STRIPE_SECRET_KEY | Stripe → Developers → API keys | Vercel env |
| STRIPE_WEBHOOK_SECRET | Stripe → the `/api/stripe/webhook` endpoint | Vercel env |

The `send-reminders` edge function uses Supabase-injected credentials — no
manual update on rotation.

## Supabase service-role key (highest blast radius — bypasses RLS)

1. Supabase Dashboard → Settings → API keys → create a **new secret key**.
2. Vercel → Settings → Environment Variables → update `SUPABASE_SERVICE_ROLE_KEY`
   in Production/Preview/Development; update `.env.local`.
3. Redeploy (`vercel redeploy` or push). Verify: log in, open the Candidatures
   page (admin-client read), submit a test feedback (service-role email path).
4. Supabase → **deactivate** the old secret key. Watch Vercel runtime logs for
   401s for a few minutes.

## Supabase publishable/anon key

Same flow, plus: it is baked into the client bundle at build time, so the
redeploy in step 3 is mandatory, and the old key keeps working in already-open
browser tabs until they reload — deactivate old only after a full redeploy.

## Resend key

1. Resend → API Keys → create new key.
2. Update Vercel env + `.env.local`; redeploy.
3. Send a test (feedback widget or « Relancer » on a test student).
4. Revoke the old key. Local gotcha: an old key exported in the shell shadows
   `.env.local` — `unset RESEND_API_KEY` and restart `pnpm dev`.

## Stripe secret key

1. Stripe → Developers → API keys → **Roll** the secret key (Stripe keeps the
   old one alive for up to 24 h — pick the window).
2. Update Vercel env; redeploy; run a €0-risk check: open /billing (card display
   uses the key) and confirm no 500.
3. After the roll window, the old key dies automatically.

## Stripe webhook signing secret

1. Stripe → Webhooks → the prod endpoint → roll the signing secret.
2. Update `STRIPE_WEBHOOK_SECRET` in Vercel; redeploy quickly (events sent
   in-between fail signature verification and are retried by Stripe).
3. Confirm the next event shows 200 in Stripe's delivery log.

## After any rotation

- Confirm nothing was committed: `git log -S <old-key-fragment> --oneline` is empty.
- Note date + reason in this file's log below.

## Rotation log

- 2026-06-28 — service-role JWT + Resend key (reactive: exposure during review).
  Migrated to sb_secret_/sb_publishable_ key format; legacy JWTs deactivated.
