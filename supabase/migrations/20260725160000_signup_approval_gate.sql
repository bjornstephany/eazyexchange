-- Manual approval gate for self-registered organizers.
-- Spec: docs/superpowers/specs/2026-07-25-signup-approval-gate-design.md
--
-- Public signup stays open; a new organizer account has zero access until
-- someone flips status to 'approved'. The gate is my_role() below: every
-- organizer-reachable policy in this database is written as
--   my_role() = 'organizer' AND ...
-- so redefining that one function gates ~30 table policies, 5 storage
-- policies and claim_school() at once — and fails CLOSED for any future
-- policy written in the same idiom.
--
-- Everything here is one transaction on purpose: between the my_role()
-- swap and the backfill, every existing organizer is locked out.

-- 1. Columns -----------------------------------------------------------------

alter table public.users
  add column status           text not null default 'pending',
  add column role_description text,
  add column how_found_us     text,
  add column reviewed_at      timestamptz,
  add column notes            text;

alter table public.users
  add constraint users_status_check
  check (status in ('pending', 'approved', 'rejected'));

-- Review queue is ordered by created_at desc and filtered by status.
create index users_status_created_at_idx
  on public.users (status, created_at desc);

create table public.signup_allowlist (
  email      text primary key,          -- always stored lowercased
  note       text,
  created_at timestamptz not null default now()
);
alter table public.signup_allowlist enable row level security;
-- Deliberately NO policies and NO grants: service role only. The baseline
-- default privileges from 20260708000001 would otherwise hand anon and
-- authenticated a grant on this table, so revoke explicitly.
revoke all on public.signup_allowlist from anon, authenticated;

-- 2. Initial status, decided in the DB ---------------------------------------
--
-- Four paths insert users rows and only the first should ever be pending:
--   lib/auth/provision.ts      self-signup            -> pending (this gate)
--   actions/join.ts            invited colleague      -> approved
--   actions/invitations.ts     invited student        -> approved
--   tests/rls/seed.ts          fixtures               -> approved
-- Putting this in provisionOrganizer would fix only the first, and a pending
-- STUDENT is a product outage: form_templates -> "students read assigned
-- templates" is my_role() = 'student', so they lose their own forms.

create function public.set_initial_user_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- An explicit value wins. Safe: users has no INSERT policy at all, so RLS
  -- denies every client insert and only the service role reaches this.
  -- tests/rls/seed.ts relies on it to state 'approved' outright.
  if new.status is distinct from 'pending' then
    return new;
  end if;

  if new.role = 'student'
     -- pre-approved tester
     or exists (select 1 from signup_allowlist a where a.email = lower(new.email))
     -- joining a school that is already approved (organizer_invites colleague);
     -- a self-signup cannot match, its school is brand new and has no members
     or exists (select 1 from users u
                 where u.school_id = new.school_id
                   and u.role = 'organizer'
                   and u.status = 'approved')
  then
    new.status := 'approved';
  end if;

  return new;
end $$;

revoke execute on function public.set_initial_user_status() from public, anon, authenticated;

create trigger trg_set_initial_user_status
  before insert on public.users
  for each row execute function public.set_initial_user_status();

-- 3. The gate ----------------------------------------------------------------

create or replace function public.my_role() returns text
language sql security definer stable set search_path = public as $$
  select role from users where id = auth.uid() and status = 'approved'
$$;

-- my_school_id() is deliberately NOT gated. A pending user keeps exactly
-- three capabilities, which is what /pending needs and no more:
--   read own users row, read own schools row, insert feedback.

-- 4. status is not self-writable ---------------------------------------------
--
-- Column grant, following the schools.name precedent (20260725122126), rather
-- than extending guard_user_immutable_fields(): that trigger fires for the
-- service role too, and app/admin/actions.ts must be able to write status.
-- This also clears the latent anon UPDATE grant on users.
--
-- The listed columns are exactly the ones the app updates through an
-- RLS-subject client: full_name (accept-invite, settings), locale (settings),
-- exchange_order (session), plus the two new self-declared intake fields.

revoke update on public.users from authenticated, anon;
grant update (full_name, email, locale, exchange_order,
              role_description, how_found_us)
  on public.users to authenticated;

-- 5. Backfill ----------------------------------------------------------------

update public.users set status = 'approved', reviewed_at = now();

-- The 2026-07-24 unprompted signup: they confirmed their email but
-- provisionOrganizer failed, leaving an auth row with no profile and a broken
-- login. Give them a real pending request so they appear in /admin and see
-- /pending instead. Stub school name matches what provisionOrganizer writes.
--
-- Guarded on the auth row existing: public.users.id references auth.users(id),
-- and that auth row exists only in production. Unguarded this would fail the
-- local `supabase db reset` and the staging apply with a foreign-key violation.
do $$
begin
  if exists (select 1 from auth.users
              where id = '374a7a59-f9de-44a0-a519-c642b9e3b9df')
     and not exists (select 1 from public.users
                      where id = '374a7a59-f9de-44a0-a519-c642b9e3b9df')
  then
    insert into public.schools (id, name)
      values ('11111111-2222-3333-4444-555555555555', '')
      on conflict (id) do nothing;

    insert into public.users (id, school_id, role, org_role, full_name, email, status)
      values ('374a7a59-f9de-44a0-a519-c642b9e3b9df',
              '11111111-2222-3333-4444-555555555555',
              'organizer', 'owner', 'Must', 'marvanemust@gmail.com', 'pending');
  end if;
end $$;

-- Orphan schools from earlier testing, by explicit id — NOT by a
-- "zero members" predicate, which is order-dependent against the stub above.
delete from public.schools where id in (
  'c015a2be-071f-4ac3-8285-ecac22e68f31',
  'aa666ac1-12cd-48b4-a06e-a86fb41dd4f9',
  '7e7c2f60-bf3a-4e82-90ec-4b0ed1c5886c'
);
