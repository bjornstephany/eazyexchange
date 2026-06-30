-- Code-review follow-ups (2026-06-30): rate limiting for the public application
-- funnel, and an intermediate 'enrolling' status that lets respondToInvitation
-- claim a "Yes" atomically (no double account-creation race).

-- ---- Rate limiting ---------------------------------------------------------
-- A tiny fixed-window counter keyed by an arbitrary string (e.g. "apply_ip:1.2.3.4"
-- or "apply_email:foo@bar.com"). RLS on with no policy: only the service-role
-- admin client (or the SECURITY DEFINER function below) can touch it.
create table if not exists rate_limits (
  key text primary key,
  hits int not null default 0,
  window_start timestamptz not null default now()
);
alter table rate_limits enable row level security;

-- Atomically bump the counter for `key` and report whether the call is within
-- `p_limit` over the trailing `p_window_seconds`. Resets the window when it has
-- elapsed. Returns true when the request is allowed, false when it should be
-- rejected. SECURITY DEFINER + pinned search_path, mirroring the guard helpers.
create or replace function check_rate_limit(p_key text, p_limit int, p_window_seconds int)
  returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_hits int;
begin
  insert into rate_limits (key, hits, window_start)
    values (p_key, 1, now())
  on conflict (key) do update
    set hits = case
                 when rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                 then 1 else rate_limits.hits + 1 end,
        window_start = case
                 when rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                 then now() else rate_limits.window_start end
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;
-- Keep it off the public PostgREST surface; the admin (service-role) client
-- bypasses these grants and is the only caller.
revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;

-- ---- 'enrolling' status ----------------------------------------------------
-- respondToInvitation('yes') claims accepted/maybe -> enrolling in one atomic
-- UPDATE before creating the auth account, so a concurrent/retried click can't
-- create a second account or corrupt the row.
alter table applications drop constraint if exists applications_status_check;
alter table applications add constraint applications_status_check
  check (status in ('draft','submitted','rejected','accepted','declined','maybe','enrolling','enrolled'));
