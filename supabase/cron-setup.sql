-- ============================================================
-- Daily reminder cron for the `send-reminders` edge function.
-- Apply manually against the live project (needs the project ref
-- and service-role key, which aren't known at migration time).
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
-- 2. Set the function's secrets (RESEND_API_KEY, EMAIL_FROM, APP_URL):
--      pnpm supabase secrets set RESEND_API_KEY=... EMAIL_FROM='EazyExchange <noreply@yourdomain>' APP_URL=https://yourapp.com
-- 3. Enable the pg_cron and pg_net extensions (Dashboard → Database → Extensions).
--
-- Schedule (runs daily at 08:00 UTC)
-- ----------------------------------
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> before running in the SQL editor.

select cron.schedule(
  'send-reminders-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- To remove the schedule later:
--   select cron.unschedule('send-reminders-daily');
