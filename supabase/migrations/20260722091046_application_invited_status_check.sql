-- 20260720143420 introduced the organizer-sent invitation flow, whose rows are
-- created with status 'invited' (actions/applications-review.ts →
-- sendApplicationInvitations). It added the invited_at discriminator column but
-- never widened applications_status_check, so every such insert violates the
-- constraint and the feature fails on first use. Prod carries zero rows with a
-- non-null invited_at, confirming it has never succeeded there.
alter table applications drop constraint if exists applications_status_check;
alter table applications add constraint applications_status_check
  check (status in ('invited','draft','submitted','rejected','accepted','declined','maybe','enrolling','enrolled'));
