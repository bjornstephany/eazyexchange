-- H2 follow-up: the insert policy scoped the exchange but not the enrolled
-- user_id, so an organizer could enroll an arbitrary user (e.g. one from another
-- school) into an exchange their school participates in. Require the enrolled
-- user to belong to the organizer's own school — matching the only legitimate
-- flow (inviteStudent enrolls a student just created in that school).
create or replace function user_in_my_school(uid uuid)
  returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from users u where u.id = uid and u.school_id = my_school_id()
  )
$$;

drop policy if exists "organizers insert enrollments" on exchange_enrollments;
create policy "organizers insert enrollments" on exchange_enrollments for insert
  with check (
    my_role() = 'organizer'
    and exchange_in_my_school(exchange_id)
    and user_in_my_school(user_id)
  );
