-- School-anchored Stripe subscription state. Written only by the webhook via
-- the service-role admin client; never writable from the browser.
alter table schools add column stripe_customer_id     text unique;
alter table schools add column stripe_subscription_id text unique;
alter table schools add column subscription_status    text;
alter table schools add column plan                   text;
alter table schools add column current_period_end     timestamptz;
alter table schools add column grace_until            timestamptz;

-- Look up a school from a Stripe customer id on every webhook event.
create index schools_stripe_customer_id_idx on schools (stripe_customer_id);

-- SECURITY: RLS is row-level, not column-level. The existing
-- "organizers update their school" policy (20260701000001) would otherwise let
-- an organizer set their own billing columns from the browser
-- (e.g. plan='scale'), granting themselves a higher exchange cap. Restrict
-- client UPDATEs to the `name` column only. The service-role admin client
-- (webhook) has BYPASSRLS + full grants, so it still writes billing state.
revoke update on schools from authenticated;
grant update (name) on schools to authenticated;
