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
| SUPABASE_ACCESS_TOKEN (sbp_…) | Supabase → Account → Access Tokens | `~/.claude-secrets.sh`, `~/.supabase/access-token` — **developer machine only** |

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

## Supabase Management API token (sbp_… personal access token)

Not an app secret — nothing in Vercel or the running app uses it, so **rotating it
cannot cause downtime**. It is the credential the Supabase **CLI** and the
**MCP server** use to act on the account: `apply_migration`, `generate_typescript_types`,
`db push`, `projects list`. Treat it as account-level: it can reach every project,
prod included.

It lives in exactly two places on the dev machine, both mode 600:

- `~/.claude-secrets.sh` — one `export SUPABASE_ACCESS_TOKEN=…` line, sourced by the shell.
- `~/.supabase/access-token` — the CLI's own store; the entire file is the token.

Both must be updated together, or the CLI and the MCP server end up on different
tokens and one of them starts returning `Unauthorized`.

1. Supabase Dashboard → **Account → Access Tokens** → *Generate new token*. There is
   no API for this: PATs can only be minted and revoked in the dashboard.
2. Write it to both files without letting it reach a shell history or a transcript:
   ```bash
   IFS= read -rs NEWTOK            # paste, press Enter — input stays hidden
   cp -p ~/.claude-secrets.sh ~/.claude-secrets.sh.bak-$(date +%Y%m%d%H%M%S)
   NEWTOK="$NEWTOK" awk '/^export SUPABASE_ACCESS_TOKEN=/ {print "export SUPABASE_ACCESS_TOKEN=" ENVIRON["NEWTOK"]; next} {print}' \
     ~/.claude-secrets.sh > /tmp/s && mv /tmp/s ~/.claude-secrets.sh && chmod 600 ~/.claude-secrets.sh
   printf '%s' "$NEWTOK" > ~/.supabase/access-token && chmod 600 ~/.supabase/access-token
   unset NEWTOK
   ```
3. Verify **before** revoking: `source ~/.claude-secrets.sh && pnpm exec supabase projects list`.
4. **Restart the Claude Code session** — the MCP server reads its env at launch, so a
   running session keeps using the old token and will 401 the moment you revoke it.
   Confirm with an MCP `list_migrations`.
5. Revoke the old token in the dashboard. Then delete the `.bak-*` files — they still
   contain live-format dead tokens.

Because it is developer-local, the usual "exposure" is a token pasted into a
terminal or a transcript rather than a committed file. Check both:
`git log -S <fragment> --oneline` **and** `grep -rl <fragment> ~/.claude/projects/`.

## After any rotation

- Confirm nothing was committed: `git log -S <old-key-fragment> --oneline` is empty.
- For developer-local secrets, also check transcripts: `grep -rl <fragment> ~/.claude/projects/`.
- Note date + reason in this file's log below.

## Rotation log

- 2026-06-28 — service-role JWT + Resend key (reactive: exposure during review).
  Migrated to sb_secret_/sb_publishable_ key format; legacy JWTs deactivated.
- 2026-07-28 — Supabase Management API token (reactive: the token was printed into
  a Claude transcript on 2026-07-27 while fixing MCP auth). Confirmed never
  committed — absent from tracked files and from `git log -S`. No app impact:
  the PAT is CLI/MCP-only and touches no Vercel env.
