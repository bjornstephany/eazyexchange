-- Hardening from full-project code review (2026-06-30).
-- Three UPDATE policies could not pin a column that must never change after
-- insert: a USING-only policy (or a WITH CHECK that cannot see OLD) let a caller
-- mutate it. RLS WITH CHECK cannot reference the pre-update row, so we enforce
-- immutability with BEFORE UPDATE triggers — mirroring guard_submission_review
-- (SECURITY DEFINER, pinned search_path, EXECUTE revoked from the API roles).
-- None of the app's flows UPDATE these columns (they are only ever set at
-- INSERT), so any UPDATE that changes them is illegitimate.

-- (1) users.role / users.school_id are immutable post-insert.
-- The "users update themselves" policy had USING (id = auth.uid()) and no
-- WITH CHECK; Postgres reuses USING as the row-check on UPDATE, and id stays
-- = auth.uid(), so a user could PATCH their own role to 'organizer' and
-- school_id to another tenant — full privilege escalation + cross-tenant breach.
create or replace function guard_user_immutable_fields()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     or new.school_id is distinct from old.school_id then
    raise exception 'role and school_id cannot be changed'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_user_immutable_fields() from public, anon, authenticated;
drop trigger if exists trg_guard_user_immutable_fields on users;
create trigger trg_guard_user_immutable_fields
  before update on users for each row
  execute function guard_user_immutable_fields();

-- Make the self-update policy's post-image explicit (defence in depth alongside
-- the trigger): a row may only be updated if it still belongs to the caller.
drop policy if exists "users update themselves" on users;
create policy "users update themselves" on users for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- (2) exchanges.school_a_id / school_b_id are immutable post-insert.
-- The UPDATE policy's WITH CHECK only requires the caller still own ONE side,
-- so an organizer could repoint the partner side to an arbitrary school,
-- stealing or severing the partner school's access.
create or replace function guard_exchange_immutable_schools()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.school_a_id is distinct from old.school_a_id
     or new.school_b_id is distinct from old.school_b_id then
    raise exception 'exchange schools cannot be changed'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_exchange_immutable_schools() from public, anon, authenticated;
drop trigger if exists trg_guard_exchange_immutable_schools on exchanges;
create trigger trg_guard_exchange_immutable_schools
  before update on exchanges for each row
  execute function guard_exchange_immutable_schools();

-- (3) submissions.assignment_id is immutable post-insert.
-- The organizer UPDATE policy has USING only; guard_submission_review covers
-- the review columns but not assignment_id, so a submission (with its answers
-- and document uploads) could be reattached to another student's assignment in
-- the same school, falsely marking them as having submitted.
create or replace function guard_submission_immutable_assignment()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignment_id is distinct from old.assignment_id then
    raise exception 'submission assignment cannot be changed'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_submission_immutable_assignment() from public, anon, authenticated;
drop trigger if exists trg_guard_submission_immutable_assignment on submissions;
create trigger trg_guard_submission_immutable_assignment
  before update on submissions for each row
  execute function guard_submission_immutable_assignment();
