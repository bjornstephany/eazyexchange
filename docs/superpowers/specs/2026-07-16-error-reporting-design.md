# Server Error Reporting — `error_reports` Bug List

**Date:** 2026-07-16
**Status:** Approved (brainstorm complete)

## Problem

When a user hits an unexpected error in production, the detailed reason is
effectively lost: Next.js redacts thrown Server Action/RSC error messages to an
opaque digest, and Vercel runtime logs are ephemeral and unstructured. Bjorn
wants every unexpected error recorded — with its detailed reason — in a
database that reads as a list of bugs to fix.

## Scope decisions (settled during brainstorm)

- **Capture unexpected server crashes only.** Expected outcomes (validation
  failures, plan caps, business rejections — the structured-return pattern) are
  working as designed and stay out. `redirect()` / `notFound()` are not errors.
- **Server-side only.** No browser reporting endpoint (spam surface, less
  trustworthy data). Most real bugs surface server-side.
- **Table only, no notifications.** Triage happens in the Supabase dashboard;
  no email ping, no admin UI.
- **Bug-list semantics, not an event log.** Rows are deduplicated by
  fingerprint with an occurrence counter and an `open`/`resolved` status.

## Architecture

Three pieces:

1. **`instrumentation.ts`** (repo root) — exports Next.js 15's
   `onRequestError` hook. Thin shim: delegates to the reporter inside a
   try/catch and never throws. The hook fires for every unexpected server
   error across server actions, RSC renders, and route handlers, receiving
   the error (including its prod digest) plus request/route context.
2. **`lib/error-reporting.ts`** — the reporter. Normalizes and sanitizes the
   error, computes the fingerprint, and records it via the admin client RPC.
   Imports `lib/supabase/admin`, so it is added to the admin allowlist test
   (`lib/supabase/__tests__/admin-allowlist.test.ts`) — a deliberate
   extension: no user session exists inside the hook, and clients must never
   have a write path to a bug table. Pure helpers (normalization,
   fingerprint, truncation, PII strip) are exported for unit testing.
3. **One migration** — the `error_reports` table plus a
   `record_error_report()` SQL function performing the atomic dedup-upsert.

## Data model

Table `error_reports`:

| column          | type        | notes                                        |
| --------------- | ----------- | -------------------------------------------- |
| `id`            | uuid PK     | `gen_random_uuid()`                           |
| `fingerprint`   | text UNIQUE | hash of normalized message + route path      |
| `message`       | text        | sanitized, truncated to 2000 chars           |
| `stack`         | text        | sanitized, truncated to 8000 chars           |
| `digest`        | text        | latest Next.js error digest (nullable)       |
| `route_path`    | text        | route/pathname from hook context             |
| `method`        | text        | HTTP method                                  |
| `occurrences`   | int         | default 1                                    |
| `first_seen_at` | timestamptz | default now()                                |
| `last_seen_at`  | timestamptz | updated on every recurrence                  |
| `status`        | text        | `open` / `resolved`, default `open`, CHECK   |

RLS enabled with **zero policies** (the `audit_log` pattern): only the service
role can read or write. `EXECUTE` on `record_error_report()` is revoked from
`anon` and `authenticated`. Bjorn reads and triages in the Supabase dashboard
and flips `status` to `resolved` by hand.

## Capture flow

On each unexpected server error the reporter:

1. **Normalizes the message** — UUIDs and long digit runs replaced with
   placeholders so "Exchange abc-123 not found" and "Exchange def-456 not
   found" group as one bug.
2. **Computes the fingerprint** — SHA-256 of normalized message + route path.
   Stack frames are deliberately excluded: minified frame text changes across
   deploys and would split one bug into many rows.
3. **Strips PII defensively** — email-shaped strings are redacted from both
   message and stack before storage (messages are developer-authored strings,
   but this honors the no-student-PII rule against accidents).
4. **Calls `record_error_report` via RPC** —
   `INSERT ... ON CONFLICT (fingerprint) DO UPDATE`: new fingerprint → new
   `open` row; existing → `occurrences + 1`, `last_seen_at = now()`, digest
   refreshed; a `resolved` row that recurs flips back to `open` (free
   regression detection).

## Reporter failure handling

Same contract as `logAudit`: the reporter never throws and never blocks the
request beyond its own awaited write. Any internal failure (missing env in
local dev, DB outage, unexpected shape) degrades to a single `console.error`
visible in Vercel logs. A bug-logging hiccup must never worsen the user's
error experience.

## Testing

- **Unit (vitest):** message normalization (UUID/number placeholders),
  fingerprint stability across differing ids, truncation limits, email
  redaction, and the reporter's never-throw contract with a mocked/failing
  admin client.
- **RLS matrix (same PR, per CLAUDE.md):** anon and authenticated users can
  neither `SELECT` nor `INSERT`/`UPDATE` `error_reports`, and cannot execute
  `record_error_report()`.
- **Admin allowlist:** `lib/error-reporting.ts` added to the allowlist test.
- **Migration workflow:** staging first (`.env.staging` db push), then prod
  via MCP `apply_migration`; regenerate `types/supabase.ts`.

## Out of scope (YAGNI)

Admin UI, notifications, client-side capture, source-map symbolication,
retention/cleanup (revisit if the table ever grows large).
