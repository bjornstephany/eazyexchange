-- Perf (audit follow-up, Phase B optional). These student-facing policies call
-- auth.uid() directly, so Postgres re-evaluates it for every scanned row
-- (performance advisor: auth_rls_initplan). Wrapping it in a scalar subquery,
-- (select auth.uid()), lets the planner evaluate it once per statement via an
-- InitPlan. Same value, same semantics — this is a planner hint only, the
-- access rules are unchanged. ALTER POLICY replaces only the expressions, so
-- roles/command stay intact. Organizer policies go through the STABLE
-- my_role()/my_school_id() helpers (20260705000001) and are not affected here.

alter policy "students read own assignments" on assignments
  using (student_id = (select auth.uid()));

alter policy "students read own enrollment" on exchange_enrollments
  using (user_id = (select auth.uid()));

alter policy "students read themselves" on users
  using (id = (select auth.uid()));

alter policy "users update themselves" on users
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "students manage own submissions" on submissions
  using (assignment_student(assignment_id) = (select auth.uid()));

alter policy "students read enrolled exchanges" on exchanges
  using (exists (
    select 1 from exchange_enrollments e
    where e.exchange_id = exchanges.id and e.user_id = (select auth.uid())
  ));

alter policy "students manage own uploads" on document_uploads
  using (submission_student(submission_id) = (select auth.uid()))
  with check (
    submission_student(submission_id) = (select auth.uid())
    and slot_template(slot_id) = submission_template(submission_id)
  );

alter policy "students manage own answers" on field_answers
  using (submission_student(submission_id) = (select auth.uid()))
  with check (
    submission_student(submission_id) = (select auth.uid())
    and field_template(field_id) = submission_template(submission_id)
  );
