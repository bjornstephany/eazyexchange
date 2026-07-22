# Retention sweep runbook

The daily sweep is `POST /api/cron/retention-sweep` (Next route,
`lib/retention/sweep.ts`). It runs **log-only** until `RETENTION_ENFORCE=1`.

## Environment (Vercel Production)

- `CRON_SECRET` — shared secret the pg_cron job presents in `x-cron-secret`.
  Independent from send-reminders' Supabase function secret.
- `RETENTION_ENFORCE` — unset/`0` = log-only (default). `1` = actually delete.

## Schedule it (Supabase SQL editor, prod — run once)

Replace `<CRON_SECRET>` with the Vercel value; do NOT commit it.

    select cron.schedule('retention-sweep-daily', '0 3 * * *', $$
      select net.http_post(
        url := 'https://eazyexchange.com/api/cron/retention-sweep',
        headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>', 'Content-Type', 'application/json'),
        body := '{}'::jsonb
      );
    $$);

03:00 UTC is clear of send-reminders (08:00) and keep-warm (*/5). `net.http_post`
fires async — pg_net does not block on the response, and the route may run up to
`maxDuration` (300s) on Vercel.

## Rollout

1. Deploy with `RETENTION_ENFORCE` off. Schedule the cron.
2. Each morning read the latest `audit_log` row where `action='retention.sweep'`
   — `metadata` holds `{ mode: 'log-only', <category>: <count>, ... }`.
3. When the would-delete counts look right across a full cycle, set
   `RETENTION_ENFORCE=1` in Vercel Production and redeploy. Re-check counts.
