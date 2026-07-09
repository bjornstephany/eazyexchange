-- Baseline client-role table grants, stated explicitly.
--
-- Hosted Supabase projects grant SELECT/INSERT/UPDATE/DELETE on public tables
-- to anon/authenticated/service_role via default privileges created with the
-- project; every earlier migration implicitly relied on that (20260701000002
-- even revokes UPDATE on schools, proving the grant was assumed). The CLI
-- local stack ships WITHOUT those defaults, so a fresh `supabase db reset`
-- yields tables no client role can touch and the app/RLS suite break. This
-- migration codifies the grants in the repo: idempotent no-op on prod, makes
-- local/CI/staging faithful to prod. RLS remains the isolation boundary.

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

-- Re-apply the schools hardening (20260701000002): the blanket grant above
-- would otherwise restore full UPDATE to authenticated. Billing columns are
-- webhook-only; clients may update name only.
revoke update on public.schools from authenticated;
grant update (name) on public.schools to authenticated;

-- Future tables created by migrations (run as postgres) get the same
-- baseline, matching hosted default privileges. Tables that must be narrower
-- (e.g. append-only logs) revoke explicitly in their own migration.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
