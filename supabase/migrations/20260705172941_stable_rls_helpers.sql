-- Perf (audit follow-up, Phase B). my_role() and my_school_id() were created
-- VOLATILE (20260624000002_rls_policies.sql), so the planner re-runs their
-- `users` subquery for every scanned row a policy touches. Marking them STABLE
-- lets the planner evaluate each once per statement. The later recursion-fix
-- helpers (20260625000005) are already STABLE; only these two lagged.
-- Bodies, arguments, grants and ownership are unchanged — RLS behaviour is
-- identical, this is a planner hint only.
alter function public.my_role() stable;
alter function public.my_school_id() stable;
