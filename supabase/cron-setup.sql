-- ============================================================
-- Daily reminder cron for the `send-reminders` edge function.
-- Apply manually against the live project (needs the project ref,
-- which isn't known at migration time).
--
-- The cron runs daily; the function itself paces each student's
-- reminders (weekly while >7 days out, daily in the final week and
-- while overdue) via assignments.last_reminded_at.
-- ============================================================
--
-- Prerequisites
-- -------------
-- 1. Deploy the function:
--      pnpm supabase functions deploy send-reminders
-- 2. Set the function's secrets (SERVICE_KEY, RESEND_API_KEY, EMAIL_FROM, APP_URL, CRON_SECRET):
--      pnpm supabase secrets set SERVICE_KEY=<sb_secret_...> RESEND_API_KEY=... EMAIL_FROM='EazyExchange <noreply@yourdomain>' APP_URL=https://yourapp.com CRON_SECRET=<long-random-string>
--    SERVICE_KEY is your new sb_secret_… key, so the function doesn't depend on the
--    legacy service_role key. CRON_SECRET gates the function (verify_jwt is off);
--    use the SAME value in the x-cron-secret header below. Generate one with
--    e.g. `openssl rand -hex 32`.
-- 3. Enable the pg_cron and pg_net extensions (Dashboard → Database → Extensions).
--
-- Schedule (runs daily at 08:00 UTC)
-- ----------------------------------
-- Replace <PROJECT_REF> and <CRON_SECRET> before running in the SQL editor.

select cron.schedule(
  'send-reminders-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    -- verify_jwt is off for this function, so no Authorization bearer is needed;
    -- the x-cron-secret header is what authorizes the call.
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- To remove the schedule later:
--   select cron.unschedule('send-reminders-daily');
