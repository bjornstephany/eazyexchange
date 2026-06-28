-- H2: enrollment policies were gated only by organizer role, exposing every
-- school's enrollments to every organizer (read) and allowing cross-tenant
-- inserts. Scope them to exchanges the caller's school participates in. The
-- helper is SECURITY DEFINER so the exchanges lookup inside the policy does not
-- recurse into the exchanges RLS policies (which themselves reference
-- exchange_enrollments).
create or replace function exchange_in_my_school(eid uuid)
  returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from exchanges e
    where e.id = eid
      and (e.school_a_id = my_school_id() or e.school_b_id = my_school_id())
  )
$$;

drop policy if exists "organizers read enrollments" on exchange_enrollments;
create policy "organizers read enrollments" on exchange_enrollments for select
  using (my_role() = 'organizer' and exchange_in_my_school(exchange_id));

drop policy if exists "organizers insert enrollments" on exchange_enrollments;
create policy "organizers insert enrollments" on exchange_enrollments for insert
  with check (my_role() = 'organizer' and exchange_in_my_school(exchange_id));
