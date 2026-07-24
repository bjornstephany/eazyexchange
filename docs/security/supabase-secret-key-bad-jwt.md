# Supabase: `sb_secret_*` key intermittently rejected on `/auth/v1/admin/*`

**Status:** worked around 2026-07-24 — prod reverted to the legacy `service_role`
JWT. Unresolved upstream. Legacy JWT keys are on Supabase's deprecation path, so
this must be settled before they are removed.

Paste-ready reproduction report for Supabase support.

---

## Summary

On project `rgisrqlbcjdoetoybaqd` (Production), roughly **17–27% of requests to
`/auth/v1/admin/*` authenticated with the new-format `sb_secret_*` API key fail
with `403 bad_jwt`**. The same key on PostgREST never fails, the legacy
`service_role` JWT on the same endpoints never fails, and a second project of
ours on the same key generation never fails.

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
| legacy `service_role` JWT (same project) | `/auth/v1/admin/users` | 0/30 failed |
| `sb_secret_*` (same project, same process) | `/rest/v1/schools` | 0/30 failed |
| `sb_publishable_*` (same project) | `/auth/v1/token` (bad creds) | 0/20 anomalies — clean `400 invalid_credentials` |
| legacy `service_role` JWT (project `loygdbjdyciipvdcpvmr`) | `/auth/v1/admin/users` | 0/30 failed |

Failures are randomly distributed across calls and across admin routes
(`listUsers`, `getUserById`, `generateLink` all hit) — it is not route-specific.
Retrying the identical call immediately usually succeeds, which is what suggests
a subset of auth instances behind the load balancer is responsible.

## What we ruled out

- **Not the ES256 signing-key migration.** Both projects serve a single ES256 key
  from `/auth/v1/.well-known/jwks.json`; the healthy one is migrated too.
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
3. What is the deadline for legacy `service_role` JWT removal on this project?
   We are depending on it until this is resolved.

## Our mitigation

- Prod `SUPABASE_SERVICE_ROLE_KEY` reverted to the legacy `service_role` JWT.
- `emailStudentSetupLink` in `actions/invitations.ts` retries `generateLink` 3×
  and records an `email_send_log` error row if every attempt fails.

Other `auth.admin.*` call sites remain single-attempt and would be exposed again
if the secret key were reinstated: `actions/invitations.ts` (`createUser`,
`deleteUser`), `actions/join.ts`, `actions/settings.ts`,
`app/auth/callback/route.ts`, `lib/retention/erase.ts`.
