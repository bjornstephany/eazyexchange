-- The library drawer replaces auto-seeding (forms-page redesign 2026-07-16):
-- new exchanges start with an empty grid and organizers add standard templates
-- explicitly. Give existing exchanges the same clean slate by deleting the
-- auto-seeded drafts that are still pristine — draft status, no attached PDF,
-- no assignments. form_fields, document_slots and assignments cascade.
delete from form_templates
where standard_key is not null
  and status = 'draft'
  and template_file_path is null
  and not exists (select 1 from assignments a where a.template_id = form_templates.id);
