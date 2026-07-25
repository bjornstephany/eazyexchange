-- Close the last client write path into `schools`.
--
-- 20260701000002 narrowed `authenticated`'s UPDATE on schools to the `name`
-- column, because organizers provisioned through Google arrived with an empty
-- school name and set it themselves on their first exchange. That is no longer
-- how a name is written: since the school registry (20260724115318), the only
-- writer of schools.name is the `claim_school()` SECURITY DEFINER RPC, which
-- re-derives the name from the registry rather than trusting the client. Every
-- other write to the table (stripe_customer_id, subscription_status, plan,
-- grace_until, provisioning, deletion) goes through the service-role admin
-- client.
--
-- So `authenticated` needs no UPDATE on schools at all. Revoking the column
-- grant is defence in depth: RLS already scoped the policy to the organizer's
-- own row, but a grant nobody uses is a grant that can be misused. SECURITY
-- DEFINER functions run as owner and service_role bypasses both grants and
-- RLS, so no application path changes.

revoke update (name) on public.schools from authenticated;
revoke update on public.schools from authenticated;

-- With no UPDATE grant left, this policy can never be reached (privilege
-- checks precede RLS). Drop it rather than leave a policy whose comment still
-- claims createExchange depends on it — createExchange only *reads* the name.
drop policy if exists "organizers update their school" on public.schools;
