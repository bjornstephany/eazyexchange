-- C1: students own their submission row but must not set the review outcome.
-- This trigger rejects any change to review-controlled columns (status ->
-- approved/rejected, reviewer_id, reviewed_at, review_note) unless the caller is
-- an organizer for the school that owns the submission. Students may still move
-- status between draft and submitted. SECURITY DEFINER so the helper calls and
-- the submissions read are not re-filtered by RLS.
create or replace function guard_submission_review()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  touched boolean;
  is_org boolean;
begin
  if tg_op = 'INSERT' then
    touched := (new.status in ('approved', 'rejected'))
            or new.reviewer_id is not null
            or new.reviewed_at is not null
            or new.review_note is not null;
  else
    touched := (new.status is distinct from old.status and new.status in ('approved', 'rejected'))
            or new.reviewer_id is distinct from old.reviewer_id
            or new.reviewed_at is distinct from old.reviewed_at
            or new.review_note is distinct from old.review_note;
  end if;

  if touched then
    is_org := (my_role() = 'organizer' and submission_school(new.id) = my_school_id());
    if not coalesce(is_org, false) then
      raise exception 'Only an organizer for this school may set submission review fields'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_submission_review on submissions;
create trigger trg_guard_submission_review
  before insert or update on submissions for each row
  execute function guard_submission_review();
