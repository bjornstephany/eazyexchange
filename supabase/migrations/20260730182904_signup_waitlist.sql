-- Signup waitlist — replaces the /admin approval queue.
-- Spec: docs/superpowers/specs/2026-07-30-signup-waitlist-design.md
--
-- The decision moves from AFTER the account exists (a human clicking
-- « Approuver » at /admin) to BEFORE it exists: both signup paths consult
-- signup_allowlist, and everyone else lands here instead of leaving behind a
-- permanent half-account (an auth row, a blank school, a users row that is
-- awkward to delete against four NO ACTION foreign keys).
--
-- users.status / my_role() / set_initial_user_status() are deliberately NOT
-- touched. ~30 table policies, 5 storage policies and claim_school() are
-- written as `my_role() = 'organizer' AND …`, so they all inherit that gate —
-- including policies not yet written. After this change it simply never fires
-- for a new account; it remains the fail-closed backstop if the
-- application-layer check is ever bypassed.

create table public.signup_waitlist (
  email       text primary key,          -- always stored lowercased
  full_name   text,
  source      text not null check (source in ('password','google')),
  created_at  timestamptz not null default now(),
  -- Stamped by hand on the day access opens, so a second launch email does not
  -- re-mail everyone. Nothing in the application writes it.
  notified_at timestamptz,
  note        text
);

alter table public.signup_waitlist enable row level security;
-- Deliberately NO policies and NO grants: service role only, exactly like
-- signup_allowlist. The baseline default privileges from 20260708000001 would
-- otherwise hand anon and authenticated a grant on this table, so revoke
-- explicitly. This revoke is the ONLY thing protecting a table of third-party
-- email addresses — tests/rls/signup-waitlist.test.ts asserts both roles.
revoke all on public.signup_waitlist from anon, authenticated;

-- --------------------------------------------------------------------------
-- One-off data fixes. All three are written set-wise or with ON CONFLICT so
-- they are correct on local, staging and production alike, and survive a
-- `supabase db reset`.
-- --------------------------------------------------------------------------

-- 1. The owner's own testers, allowlisted forever. Polly gets her own school,
--    because that is what a self-signup does; a second seat on the owner's
--    school is what the /join colleague invite is for.
insert into public.signup_allowlist (email, note) values
  ('bjornstephany@gmail.com', 'owner — permanent tester'),
  ('pollystephany@gmail.com', 'owner — separate organizer, own school')
on conflict (email) do nothing;

-- 2. The owner's existing production account is sitting `pending`. Without
--    this he would have to delete and re-create his own account just to get
--    in. A no-op on local and staging, where the row does not exist.
--    MUST run before fix 3, or fix 3 copies him onto the waitlist.
update public.users
   set status = 'approved', reviewed_at = now()
 where email = 'bjornstephany@gmail.com'
   and status <> 'approved';

-- 3. Every remaining pending organizer moves to the waitlist, so they receive
--    the launch email instead of being forgotten on a page nobody visits.
--    Set-wise rather than by address: correct on every environment, needs no
--    existence guard, and a no-op wherever there are none. Their users row is
--    left in place — it stays `pending`, so it still has zero access, and
--    deleting it would mean fighting the same four NO ACTION foreign keys
--    scripts/reset-account.mjs exists to handle.
insert into public.signup_waitlist (email, full_name, source, note)
select u.email,
       nullif(u.full_name, ''),
       'password',
       'migré depuis la file /admin le 2026-07-30'
  from public.users u
 where u.role = 'organizer'
   and u.status = 'pending'
on conflict (email) do nothing;
