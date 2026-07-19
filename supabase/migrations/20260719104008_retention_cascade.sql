-- Retention / erasure cascade cleanup.
-- FK ON DELETE audit for subject erasure (see
-- docs/superpowers/specs/2026-07-18-data-retention-lifecycle-design.md):
--   Already ON DELETE CASCADE — no change needed:
--     submissions.assignment_id, document_uploads.submission_id,
--     field_answers.submission_id, assignments.student_id,
--     assignments.template_id, exchange_enrollments.user_id, feedback.user_id,
--     public.users.id -> auth.users.id.
--   => auth.admin.deleteUser(userId) cascades public.users and every per-student
--      operational row (assignments, submissions, field_answers,
--      document_uploads, enrollments) in a single delete.
--   Applications have NO child FKs pointing at applications.id, so an
--   application row deletes on its own.
--   Gap: applications.enrolled_user_id was ON DELETE NO ACTION, which BLOCKS
--   deleting an enrolled student's user row. Switch to SET NULL so a user
--   delete is never hard-blocked. (The erase primitive still deletes the linked
--   application explicitly to erase its data; SET NULL is the safety net for the
--   sweep path, where the application may already be purged.)

alter table public.applications
  drop constraint applications_enrolled_user_id_fkey,
  add constraint applications_enrolled_user_id_fkey
    foreign key (enrolled_user_id) references public.users(id) on delete set null;
