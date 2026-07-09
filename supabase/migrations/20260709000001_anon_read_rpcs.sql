-- W3 blast-radius reduction: narrow anon-callable read functions so the public
-- apply entry page and the same-device draft peek no longer run on the
-- service-role client. Rule: nothing beyond a first name on the anon surface.
-- SECURITY DEFINER + pinned search_path + explicit grants, mirroring
-- check_rate_limit (20260630000004).

-- /apply/<slug> landing state. The slug is public by design; returns no PII.
create or replace function get_apply_page_exchange(p_slug text)
  returns table (name text, application_open boolean, application_deadline date)
  language sql stable security definer set search_path = public as $$
    select e.name, e.application_open, e.application_deadline
    from exchanges e
    where e.apply_slug = p_slug;
$$;
revoke execute on function public.get_apply_page_exchange(text) from public;
grant execute on function public.get_apply_page_exchange(text) to anon, authenticated;

-- Same-device welcome-back peek for a stored resume token: live-draft state,
-- first name and language only — never the rest of the draft.
create or replace function peek_application_draft(p_token text)
  returns table (status text, first_name text, language text, resume_token_expires_at timestamptz)
  language sql stable security definer set search_path = public as $$
    select a.status, a.data->>'first_name', a.language, a.resume_token_expires_at
    from applications a
    where a.resume_token = p_token;
$$;
revoke execute on function public.peek_application_draft(text) from public;
grant execute on function public.peek_application_draft(text) to anon, authenticated;
