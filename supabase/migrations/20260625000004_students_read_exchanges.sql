-- Students need to read the exchange their assigned forms belong to: /my-forms
-- groups assignments by exchange name via form_templates!inner -> exchanges!inner.
-- The initial schema only had an organizer SELECT policy on exchanges, so the
-- inner join dropped every assignment for students (empty checklist).
-- Allow students to read exchanges they're enrolled in.
create policy "students read enrolled exchanges" on exchanges for select
  using (
    exists (
      select 1 from exchange_enrollments e
      where e.exchange_id = exchanges.id and e.user_id = auth.uid()
    )
  );
