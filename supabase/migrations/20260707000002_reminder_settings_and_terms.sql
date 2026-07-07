-- Sub-project 4: per-exchange automatic-reminder controls + acceptance terms.
--
-- exchanges.reminders_enabled / reminder_cadence: master switch + named preset
-- read by the send-reminders edge function. Defaults reproduce the current
-- behavior (weekly, then daily during the final week and while overdue), so
-- existing exchanges need no backfill and keep today's pacing.
--
-- applications.terms_acknowledged_at: stamped when an invited applicant clicks
-- « Oui, je veux participer » — records the explicit terms acknowledgment.
-- Deliberately kept if the enrollment claim is later released: the click happened.

alter table exchanges
  add column reminders_enabled boolean not null default true,
  add column reminder_cadence text not null default 'normale'
    check (reminder_cadence in ('douce', 'normale', 'insistante'));

alter table applications
  add column terms_acknowledged_at timestamptz;
