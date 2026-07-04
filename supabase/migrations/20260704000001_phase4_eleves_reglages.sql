-- Phase 4 (Élèves + Réglages): organizer profile fields, team roles + invites,
-- exchange archiving.

-- 1 · users: org_role ---------------------------------------------------------
alter table users
  add column org_role text not null default 'admin' check (org_role in ('owner', 'admin'));

-- Backfill BEFORE the trigger below pins org_role: the earliest organizer of
-- each school becomes its owner. (The pre-existing trigger version only pins
-- role/school_id, so this UPDATE passes.)
update users u set org_role = 'owner'
where u.role = 'organizer'
  and u.id = (
    select x.id from users x
    where x.school_id = u.school_id and x.role = 'organizer'
    order by x.created_at, x.id
    limit 1
  );

-- Pin org_role alongside role/school_id (mirrors 20260630000003): the
-- "users update themselves" RLS policy would otherwise let an admin PATCH
-- themselves to owner. Ownership transfer is not a feature; no app path
-- (service-role included) updates org_role after insert.
create or replace function guard_user_immutable_fields()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     or new.school_id is distinct from old.school_id
     or new.org_role is distinct from old.org_role then
    raise exception 'role, school_id and org_role cannot be changed'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_user_immutable_fields() from public, anon, authenticated;

-- 2 · organizer_invites --------------------------------------------------------
-- Every write goes through service-role server actions (the owner check lives
-- in the action), so there are no INSERT/UPDATE/DELETE policies on purpose.
create table organizer_invites (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  email text not null,
  token text not null unique,
  invited_by uuid references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index organizer_invites_school_idx on organizer_invites(school_id);
alter table organizer_invites enable row level security;
create policy "organizers read school invites" on organizer_invites for select
  using (my_role() = 'organizer' and school_id = my_school_id());

-- 3 · exchange archiving --------------------------------------------------------
alter table exchanges add column archived_at timestamptz;
