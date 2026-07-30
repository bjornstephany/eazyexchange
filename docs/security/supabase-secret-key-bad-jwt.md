# Supabase: `sb_secret_*` key intermittently rejected on `/auth/v1/admin/*`

**Status:** unresolved. Prod runs on the affected `sb_secret_*` key because it is
the **only usable credential** — this project disabled its legacy `anon` /
`service_role` keys on 2026-06-28. `actions/invitations.ts` retries around the
failure; nothing else does.

Paste-ready reproduction report for Supabase support.

---

## Summary

On project `rgisrqlbcjdoetoybaqd` (Production), roughly **17–27% of requests to
`/auth/v1/admin/*` authenticated with the new-format `sb_secret_*` API key fail
with `403 bad_jwt`**. The same key on PostgREST never fails, and user-facing auth
with the publishable key never fails. We cannot compare against the legacy
`service_role` JWT: this project disabled its legacy keys on 2026-06-28, so
`sb_secret_*` is the only credential we have.

Exact error returned to the client and recorded in the auth logs:

```
403 bad_jwt
invalid JWT: unable to parse or verify signature, token is unverifiable:
error while executing keyfunc: unrecognized JWT kid <nil> for algorithm ES256
```

The affected key is `sb_secret_B3pQ…` (id `a4e32688-8a1a-400f-bcd7-f96d6923b4de`,
created 2026-06-28), which carries `secret_jwt_template: {"role": "service_role"}`.

## Impact that led us to find it

A parent confirmed their child's place on an exchange. Our server action called
`auth.admin.createUser` (**200**) and then, one second later on the same client
with the same credential, `auth.admin.generateLink` (**403 bad_jwt**). The
student never received their account-setup link.

Auth log, 2026-07-24:

```
11:03:50  POST /admin/users          → 200   actor_username: service_role
11:03:51  POST /admin/generate_link  → 403   error_code: bad_jwt
```

## Reproduction

Node 22, `@supabase/supabase-js` 2.108.2. 30 sequential calls to a harmless
`auth.admin.listUsers({ page: 1, perPage: 1 })`, counting `error.code === 'bad_jwt'`:

| credential | endpoint | result |
| --- | --- | --- |
| `sb_secret_*` (project `rgisrqlbcjdoetoybaqd`) | `/auth/v1/admin/users` | **5/30 failed (17%)**; a repeat run 8/30 (27%) |
| `sb_secret_*` (same project, same process) | `/rest/v1/schools` | 0/30 failed |
| `sb_publishable_*` (same project) | `/auth/v1/token` (bad creds) | 0/20 anomalies — clean `400 invalid_credentials` |

Failures are randomly distributed across calls and across admin routes
(`listUsers`, `getUserById`, `generateLink` all hit) — it is not route-specific.
Retrying the identical call immediately usually succeeds, which is what suggests
a subset of auth instances behind the load balancer is responsible.

**If you repeat these measurements, throttle them.** Roughly 300 requests in a
few minutes got our office IP blocked by Cloudflare at the `supabase.co` edge
(`403`, "Sorry, you have been blocked" HTML instead of JSON). That block is
per-client and does not affect the deployed app, but it invalidates any run that
straddles it — count outcomes by category, never as "not-the-error-I-expected".

## What we ruled out

- **Not the ES256 signing-key migration.** `/auth/v1/.well-known/jwks.json`
  serves a single ES256 key, as it does on our staging project, which is healthy.
- **Not our code.** Reproduced from a standalone script with a fresh client.
- **Not PostgREST or user-facing auth.** Both are clean with the same keys.
- **Not the key value.** `403` alternates with `200` for the same key within seconds.

The `kid <nil>` in the error suggests some instances fail to resolve the
`sb_secret_*` key against the API-keys table and fall back to verifying it as a
JWT against the ES256 JWKS — where a key with no `kid` cannot match.

## Questions for support

1. Is this a known issue with `secret_jwt_template`-backed secret keys on the
   auth admin API?
2. Is there a fleet-side fix, or should we rotate to a freshly minted secret key?
3. Since our legacy keys are already disabled, we have no working fallback. Is
   re-enabling them the recommended stopgap, or is there a better one?

## Our mitigation

**Every `auth.admin.*` call site now retries** (2026-07-30). The shared wrapper is
`lib/supabase/admin-retry.ts` — 3 attempts, 150/400 ms backoff, returning the last
result so each caller's existing error handling is untouched.

- `actions/invitations.ts` — `createUser`, and both rollback `deleteUser` calls
- `actions/join.ts` — `createUser` and the rollback `deleteUser`
- `actions/settings.ts` — `deleteUser` (remove collaborator)
- `app/auth/callback/route.ts` — `deleteUser` (orphan Google account cleanup)
- `lib/retention/erase.ts` — `deleteUser` (GDPR erasure)
- `emailStudentSetupLink` keeps its own earlier retry, which additionally records
  an `email_send_log` error row when all attempts fail — behaviour the generic
  wrapper deliberately does not replicate.

**The retry is narrow by design: `bad_jwt` only.** Two things it must not do —

- retry `email_exists` from `createUser`, which is a legitimate business outcome
  rather than a failure;
- treat *any* 403 as retryable. The Cloudflare block described above also answers
  403 (HTML, not JSON), and retrying into it deepens the block. The discriminator
  is the `bad_jwt` code, never the status alone.

Residual exposure: a call that loses all three attempts still fails, and
`lib/retention/erase.ts` still does not check the result — a silent failure in an
erasure path, worth its own fix.
