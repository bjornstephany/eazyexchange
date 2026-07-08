-- Close a cross-tenant read left over from 20260625000003: "organizers read
-- schools" allowed ANY organizer to SELECT EVERY school row. That was written
-- when schools held only a name; 20260701000002 later added billing columns
-- (subscription_status, plan, grace_until, stripe_customer_id), silently
-- turning it into a cross-tenant billing-metadata exposure (caught by the RLS
-- matrix suite, tests/rls/matrix.test.ts).
--
-- Organizers legitimately need partner-school NAMES for pair exchanges
-- (actions/exchanges.ts embeds school_a/school_b names), so the replacement
-- scope is: schools paired with mine via an exchange. Own-school reads are
-- already covered by the base "users can read their school" policy.

-- SECURITY DEFINER helper (recursion-safe, mirrors user_in_my_school):
-- is p_school_id paired with my school on any exchange?
create or replace function school_paired_with_mine(p_school_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from exchanges e
    where (e.school_a_id = p_school_id and e.school_b_id = my_school_id())
       or (e.school_b_id = p_school_id and e.school_a_id = my_school_id())
  );
$$;
revoke execute on function public.school_paired_with_mine(uuid) from public;
grant execute on function public.school_paired_with_mine(uuid) to authenticated;

drop policy "organizers read schools" on schools;
create policy "organizers read partner schools" on schools for select
  using ((select my_role()) = 'organizer' and (select school_paired_with_mine(id)));
