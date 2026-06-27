-- H1: the "organizers manage …" policies on these child tables checked only the
-- school, letting same-school students write them. Require organizer role and
-- mirror the condition into WITH CHECK so inserts are gated too.

-- form_fields
drop policy if exists "organizers manage fields" on form_fields;
create policy "organizers manage fields" on form_fields for all
  using (my_role() = 'organizer' and template_school(template_id) = my_school_id())
  with check (my_role() = 'organizer' and template_school(template_id) = my_school_id());

-- document_slots
drop policy if exists "organizers manage slots" on document_slots;
create policy "organizers manage slots" on document_slots for all
  using (my_role() = 'organizer' and template_school(template_id) = my_school_id())
  with check (my_role() = 'organizer' and template_school(template_id) = my_school_id());

-- assignments
drop policy if exists "organizers manage assignments" on assignments;
create policy "organizers manage assignments" on assignments for all
  using (my_role() = 'organizer' and template_school(template_id) = my_school_id())
  with check (my_role() = 'organizer' and template_school(template_id) = my_school_id());
