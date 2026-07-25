-- Append-only record of what the Communication page published or sent, per
-- exchange. Read by Communication → Historique.
--
-- Why not audit_log: lib/audit.ts is ids-and-actions only, never names or
-- contents. Historique must show « Point de rendez-vous » and « Marie Dupont »
-- to be worth anything, so it gets its own table rather than bending that rule.
--
-- Written through the REQUEST-SCOPED client under RLS (lib/communication/
-- events.ts) — deliberately not the service role, so no admin-allowlist entry.
create table communication_events (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  exchange_id    uuid not null references exchanges(id) on delete cascade,
  -- on delete set null, NOT no action: this FK must never join the four that
  -- already block auth-user deletion.
  actor_id       uuid references users(id) on delete set null,
  -- Cascades so erasing an application also erases the stored applicant name.
  application_id uuid references applications(id) on delete cascade,
  kind           text not null check (kind in
                   ('info_published','info_updated','info_deleted','good_news_sent')),
  -- Denormalized: an info card title survives the card's deletion.
  subject        text not null default '',
  status         text not null default 'ok' check (status in ('ok','failed'))
);

-- Primary read path (Historique: newest first for one exchange). Doubles as the
-- exchange_id FK index.
create index communication_events_exchange_idx
  on communication_events (exchange_id, created_at desc);
-- FK indexes so the unindexed_fks advisor stays at 0.
create index communication_events_actor_idx on communication_events (actor_id);
create index communication_events_application_idx on communication_events (application_id);

alter table communication_events enable row level security;

-- Organizers whose school is either side of the exchange. Non-recursive:
-- references exchanges + the STABLE my_role()/my_school_id() helpers only, with
-- (select …) initplan wrappers per 20260705000004. Mirrors 20260719173904.
create policy "organizers read exchange communication events" on communication_events for select
  using (
    (select my_role()) = 'organizer' and exists (
      select 1 from exchanges e
      where e.id = communication_events.exchange_id
        and (e.school_a_id = (select my_school_id()) or e.school_b_id = (select my_school_id()))
    )
  );

create policy "organizers append exchange communication events" on communication_events for insert
  with check (
    (select my_role()) = 'organizer' and exists (
      select 1 from exchanges e
      where e.id = communication_events.exchange_id
        and (e.school_a_id = (select my_school_id()) or e.school_b_id = (select my_school_id()))
    )
  );

-- No policy for students — they never see this table.
-- Append-only enforcement beyond "no policy": drop the default grants so even a
-- future over-permissive policy cannot re-open mutation. Same belt-and-braces
-- as audit_log (20260709000002).
revoke update, delete, truncate on communication_events from anon, authenticated;
