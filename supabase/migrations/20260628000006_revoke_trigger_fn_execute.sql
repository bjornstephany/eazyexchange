-- L1 (security advisors 0028/0029, *_security_definer_function_executable):
-- the trigger functions are exposed as RPC endpoints (/rest/v1/rpc/...) to the
-- anon and authenticated roles. They cannot be invoked usefully that way —
-- Postgres rejects direct calls to `returns trigger` functions — but the
-- exposure is still flagged. Revoke EXECUTE to remove them from the API surface.
--
-- Verified safe: trigger execution does NOT require the firing role to hold
-- EXECUTE on the trigger function, so revoking here does not affect the triggers
-- that maintain assignments or guard submission review columns.
--
-- NOTE (intentionally NOT revoked): the RLS *helper* functions (my_role,
-- my_school_id, template_school, assignment_school, assignment_student,
-- submission_school, submission_student, has_assignment, exchange_in_my_school,
-- user_in_my_school) are referenced inside RLS policy expressions. PostgreSQL
-- requires the querying role to hold EXECUTE on functions used in policies, so
-- revoking EXECUTE from `authenticated` would break RLS for every signed-in user
-- (verified empirically: "permission denied for function my_role"). Those
-- helpers therefore retain EXECUTE; their only information exposure is the
-- caller's own role/school (auth.uid()-scoped), which is not sensitive.
-- Fully clearing those advisor entries would require relocating the helpers to a
-- non-exposed schema — deferred as a larger, separate change.
revoke execute on function public.assign_students_to_new_template()  from public, anon, authenticated;
revoke execute on function public.assign_templates_to_new_enrollment() from public, anon, authenticated;
revoke execute on function public.guard_submission_review()          from public, anon, authenticated;
