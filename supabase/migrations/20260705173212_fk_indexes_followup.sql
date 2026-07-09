-- Perf (audit follow-up, Phase C cont.). The performance advisor still flagged
-- six unindexed foreign keys after 20260705000002 — columns the original audit
-- list missed. Index them too so no FK column is left unindexed. All additive;
-- IF NOT EXISTS keeps this idempotent.
create index if not exists applications_enrolled_user_idx on applications(enrolled_user_id);
create index if not exists applications_reviewer_idx on applications(reviewer_id);
create index if not exists document_uploads_slot_idx on document_uploads(slot_id);
create index if not exists field_answers_field_idx on field_answers(field_id);
create index if not exists form_templates_created_by_idx on form_templates(created_by);
create index if not exists organizer_invites_invited_by_idx on organizer_invites(invited_by);
