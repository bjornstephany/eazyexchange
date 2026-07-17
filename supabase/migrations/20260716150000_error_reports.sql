-- Server error reporting: unexpected server crashes recorded as a deduplicated
-- bug list (spec: docs/superpowers/specs/2026-07-16-error-reporting-design.md).
-- Written ONLY by the service-role client (lib/error-reporting.ts) via
-- record_error_report(). Zero RLS policies + revoked grants: no client role
-- can read or write — stricter than audit_log (not even organizer reads).
-- Triage happens in the Supabase dashboard (flip status by hand).

create table error_reports (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,  -- sha256(normalized message + route path)
  message text not null,             -- emails redacted, truncated to 2000 chars app-side
  stack text,                        -- emails redacted, truncated to 8000 chars app-side
  digest text,                       -- latest Next.js prod error digest
  route_path text not null,          -- parameterized route from the hook context
  method text not null,
  occurrences int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'resolved'))
);

alter table error_reports enable row level security;

-- Belt and braces beyond "no policies": drop the default grants so even a
-- future over-permissive policy cannot open client access.
revoke select, insert, update, delete, truncate on error_reports from anon, authenticated;

-- Atomic dedup-upsert. A resolved bug that recurs flips back to open (free
-- regression detection); a null digest keeps the last known one.
create function record_error_report(
  p_fingerprint text,
  p_message text,
  p_route_path text,
  p_method text,
  p_stack text default null,
  p_digest text default null
) returns void
language sql security definer set search_path = public as $$
  insert into error_reports (fingerprint, message, stack, digest, route_path, method)
  values (p_fingerprint, p_message, p_stack, p_digest, p_route_path, p_method)
  on conflict (fingerprint) do update set
    occurrences  = error_reports.occurrences + 1,
    last_seen_at = now(),
    digest       = coalesce(excluded.digest, error_reports.digest),
    status       = 'open';
$$;

-- Service role only. Revoking from public removes the default EXECUTE grant,
-- so service_role needs its own explicit grant back.
revoke execute on function public.record_error_report(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_error_report(text, text, text, text, text, text)
  to service_role;
