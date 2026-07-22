-- Instant activation (docs/superpowers/specs/2026-07-21-instant-activation-design.md):
-- setting a deadline is now the act of publishing, and the « Activer » button
-- is gone. Every existing draft that would already have passed the old gate is
-- activated here so no template is stranded with no way to publish it.
--
-- Fillable drafts are deliberately excluded rather than join-checked against
-- ten nullable detail columns: production holds only test data, and any
-- fillable that stays draft can simply be deleted and re-added from the UI.
update form_templates set status = 'active'
where status = 'draft' and deadline is not null
  and kind <> 'fillable'
  and (kind <> 'pdf' or template_file_path is not null)
  and (kind <> 'online' or exists (
        select 1 from form_fields where template_id = form_templates.id));
