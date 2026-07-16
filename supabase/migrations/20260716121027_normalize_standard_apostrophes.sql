-- Normalize apostrophes in the reseeded standard-library copy to the
-- typographic ’ (U+2019) used everywhere else in the app (and by
-- lib/forms/standard-library.ts, whose SQL snapshot 20260716102357 was written
-- with SQL-escaped straight quotes). Aligns exchanges seeded by the snapshot
-- with exchanges seeded by the TS library from now on. Scope: only the 8
-- reseeded standard keys, only drafts (active old-library templates were
-- deliberately left untouched by the reseed).

update form_templates
set name = replace(name, '''', '’'),
    description = replace(description, '''', '’')
where standard_key in ('medical','decharge','absence','famille','ast','passeport','passeport-parent','esta')
  and status = 'draft'
  and (name like '%''%' or description like '%''%');

update document_slots ds
set label = replace(ds.label, '''', '’')
from form_templates ft
where ds.template_id = ft.id
  and ft.standard_key in ('medical','decharge','absence','famille','ast','passeport','passeport-parent','esta')
  and ft.status = 'draft'
  and ds.label like '%''%';

update form_fields f
set label = replace(f.label, '''', '’')
from form_templates ft
where f.template_id = ft.id
  and ft.standard_key in ('medical','decharge','absence','famille','ast','passeport','passeport-parent','esta')
  and ft.status = 'draft'
  and f.label like '%''%';
