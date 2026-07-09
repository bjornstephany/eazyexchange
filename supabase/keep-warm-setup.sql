-- ============================================================
-- Keep-warm ping for the Vercel app (mirrors cron-setup.sql).
-- Apply manually against the live project — via MCP execute_sql,
-- NOT `supabase db push` (this is not a migration).
--
-- Hits the public no-auth /api/health route every 5 minutes so the
-- function serving the logged-in app stays warm between real visits.
-- The route returns { ok: true } and touches nothing sensitive, so
-- the request needs no headers or secrets.
--
-- Caveat (accepted in the 2026-07-07 perf spec): whether warming
-- /api/health also keeps the dashboard's function warm depends on
-- Vercel's route-to-function bundling. Verify empirically ~24 h after
-- enabling (first-hit TTFB after idle). Fallback: point the ping at a
-- heavier public dynamic route (e.g. /apply/<slug>) or unschedule and
-- rely on Fluid Compute alone.
--
-- Prerequisite: pg_cron + pg_net extensions enabled (already required
-- by cron-setup.sql for send-reminders).
-- ============================================================

select cron.schedule(
  'keep-warm-app',
  '*/5 * * * *',
  $$
  select net.http_get(url := 'https://eazyexchange.com/api/health');
  $$
);

-- To remove the schedule later:
--   select cron.unschedule('keep-warm-app');
