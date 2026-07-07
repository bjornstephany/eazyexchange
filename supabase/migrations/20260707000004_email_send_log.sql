-- Email send log: one row per outgoing email attempt (audit + outbox trigger
-- signal — see docs/superpowers/specs/2026-07-07-architecture-scalability-design.md).
-- `recipient` is parents'/students' email (PII of minors): full RLS treatment.
-- Writes happen ONLY via the service role (lib/email-log.ts and the
-- send-reminders edge function) — there is deliberately no INSERT/UPDATE/DELETE
-- policy. Organizers may read their own school's rows; rows with school_id null
-- (e.g. feedback pings to the operator) are service-role-only.

create table email_send_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  recipient text not null,
  kind text not null,
  status text not null check (status in ('sent', 'error')),
  error_code int,
  school_id uuid references schools(id) on delete set null,
  exchange_id uuid references exchanges(id) on delete set null
);

-- school idx doubles as the FK index (keeps the unindexed_fks advisor at 0).
create index email_send_log_school_idx on email_send_log(school_id, created_at desc);
create index email_send_log_exchange_idx on email_send_log(exchange_id);

alter table email_send_log enable row level security;

-- STABLE helpers per 20260625000005; no auth.uid() call needed directly.
create policy "organizers read own school email log" on email_send_log for select
  to authenticated
  using (my_role() = 'organizer' and school_id = my_school_id());
