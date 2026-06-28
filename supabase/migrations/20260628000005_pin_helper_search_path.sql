-- M3 (security advisor 0011, function_search_path_mutable): pin search_path on
-- the three functions still flagged with a role-mutable search_path. The newer
-- helpers (template_school, my_role's siblings added later, etc.) already set it;
-- these three predate that convention.
--
-- ALTER FUNCTION ... SET is used instead of CREATE OR REPLACE so the bodies,
-- ownership, grants, and trigger binding are preserved untouched — only the
-- per-function search_path setting is added. With search_path pinned to public,
-- a caller cannot prepend a schema to shadow the unqualified `users` reference
-- inside the SECURITY DEFINER helpers.
alter function public.my_role()        set search_path = public;
alter function public.my_school_id()   set search_path = public;
alter function public.update_updated_at() set search_path = public;
