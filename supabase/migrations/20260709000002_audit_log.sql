-- W4: append-only audit trail for privileged actions. Written ONLY by the
-- service-role client (lib/audit.ts); no client role can INSERT/UPDATE/DELETE
-- (no policies for those verbs + the default grants are revoked, belt and
-- braces). Organizers can read their own school's entries.
--
-- Deliberately NO foreign keys: audit rows must survive the deletion of the
-- actor or target (e.g. removeOrganizer deletes the user; the trail stays).
-- PII rule: row ids and action types only — never names, emails, notes or
-- submission contents.

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,          -- null = system actor (e.g. Stripe webhook)
  actor_school_id uuid,        -- school context the action ran in
  action text not null,        -- e.g. 'submission.approved' (see lib/audit.ts)
  target_type text not null,   -- 'submission' | 'application' | 'user' | 'organizer_invite' | 'exchange' | 'school'
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_school_idx on audit_log (actor_school_id, created_at desc);

alter table audit_log enable row level security;

-- Read-only for a school's organizers. (select …) wrappers per the STABLE
-- initplan convention (20260705000004).
create policy "organizers read school audit log" on audit_log for select
  using ((select my_role()) = 'organizer' and actor_school_id = (select my_school_id()));

-- Append-only enforcement beyond "no policy": drop the default table grants so
-- even a future over-permissive policy cannot re-open client writes.
revoke insert, update, delete, truncate on audit_log from anon, authenticated;
