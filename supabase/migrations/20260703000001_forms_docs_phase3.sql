-- Phase 3 (Formulaires + Documents): product-level template columns, draft
-- lifecycle, conditional audience, PDF template storage, standard library.

-- 1 · Columns ---------------------------------------------------------------
alter table form_templates
  add column kind text not null default 'doc',
  add column status text not null default 'active',
  add column audience text not null default 'all',
  add column standard_key text,
  add column condition_label text,
  add column template_file_path text;

-- Backfill kind from the legacy type before adding coherence checks.
update form_templates set kind = case when type = 'data_entry' then 'online' else 'doc' end;

alter table form_templates alter column deadline drop not null;

alter table form_templates
  add constraint form_templates_kind_check check (kind in ('online', 'pdf', 'doc')),
  add constraint form_templates_status_check check (status in ('draft', 'active')),
  add constraint form_templates_audience_check check (audience in ('all', 'conditional')),
  -- kind='online' ⇔ type='data_entry'; pdf/doc ⇔ document_upload
  add constraint form_templates_kind_type_coherent check (
    (kind = 'online' and type = 'data_entry')
    or (kind in ('pdf', 'doc') and type = 'document_upload')
  ),
  -- an active template always has a deadline (drafts may not)
  add constraint form_templates_active_has_deadline check (status = 'draft' or deadline is not null),
  -- only pièces (docs) can be conditional
  add constraint form_templates_conditional_is_doc check (audience = 'all' or kind = 'doc');

create unique index form_templates_standard_key_unique
  on form_templates (exchange_id, standard_key) where standard_key is not null;

alter table exchanges add column phase2_checklist_sent_at timestamptz;

-- 2 · Trigger gating ---------------------------------------------------------
-- Auto-assign only ACTIVE templates for EVERYONE ('all'). Draft and conditional
-- templates get assignments from the activation server action instead.
create or replace function assign_students_to_new_template()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and new.audience = 'all' then
    insert into assignments (template_id, student_id)
    select new.id, u.id
    from exchange_enrollments e
    join users u on u.id = e.user_id
    where e.exchange_id = new.exchange_id
      and u.school_id = new.school_id
      and u.role = 'student'
    on conflict (template_id, student_id) do nothing;
  end if;
  return new;
end;
$$;

-- draft → active on an 'all' template assigns every enrolled student.
create or replace function assign_students_on_activation()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'draft' and new.status = 'active' and new.audience = 'all' then
    insert into assignments (template_id, student_id)
    select new.id, u.id
    from exchange_enrollments e
    join users u on u.id = e.user_id
    where e.exchange_id = new.exchange_id
      and u.school_id = new.school_id
      and u.role = 'student'
    on conflict (template_id, student_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_on_template_activate on form_templates;
create trigger trg_assign_on_template_activate
  after update on form_templates for each row
  execute function assign_students_on_activation();

-- New enrollment: only active 'all' templates. New enrollees are NOT
-- auto-added to conditional docs — the organizer chooses.
create or replace function assign_templates_to_new_enrollment()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into assignments (template_id, student_id)
  select ft.id, new.user_id
  from form_templates ft
  join users u on u.id = new.user_id
  where ft.exchange_id = new.exchange_id
    and ft.school_id = u.school_id
    and ft.status = 'active'
    and ft.audience = 'all'
    and u.role = 'student'
  on conflict (template_id, student_id) do nothing;
  return new;
end;
$$;

-- 3 · Storage bucket for organizer-uploaded PDF templates --------------------
-- Object keys: <school_id>/<template_id>.pdf
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-templates', 'form-templates', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "organizers manage school template files" on storage.objects
  for all
  using (
    bucket_id = 'form-templates'
    and my_role() = 'organizer'
    and (storage.foldername(name))[1] = my_school_id()::text
  )
  with check (
    bucket_id = 'form-templates'
    and my_role() = 'organizer'
    and (storage.foldername(name))[1] = my_school_id()::text
  );

-- Students may download the PDF of templates they are assigned.
create policy "students read assigned template files" on storage.objects
  for select
  using (
    bucket_id = 'form-templates'
    and exists (
      select 1 from assignments a
      where a.student_id = auth.uid()
        and storage.filename(name) = a.template_id::text || '.pdf'
    )
  );

-- 4 · Standard-library backfill for existing exchanges -----------------------
-- Frozen SQL snapshot of lib/forms/standard-library.ts (which owns the data
-- for exchanges created from now on). All items are drafts, so the gated
-- triggers stay silent. created_by = any organizer of the owning school;
-- exchanges without one are skipped.
with owner as (
  select e.id as exchange_id, e.school_a_id as school_id, u.id as user_id
  from exchanges e
  join lateral (
    select id from users
    where school_id = e.school_a_id and role = 'organizer' limit 1
  ) u on true
),
tpl (standard_key, kind, type, audience, name, description, condition_label) as (
  values
    ('sante', 'pdf', 'document_upload', 'all', 'Formulaire de santé',
     'Antécédents médicaux, allergies, traitements en cours et contacts d''urgence.', null),
    ('decharge', 'pdf', 'document_upload', 'all', 'Décharge de responsabilité',
     'Autorisation parentale de participation et décharge de responsabilité pour la durée du séjour.', null),
    ('photo', 'pdf', 'document_upload', 'all', 'Consentement photo',
     'Droit à l''image de l''élève : photos et vidéos pendant l''échange.', null),
    ('accueil', 'online', 'data_entry', 'all', 'Conditions d''accueil',
     'Composition du foyer, chambre, alimentation et animaux — rempli en ligne par la famille d''accueil.', null),
    ('passeport', 'doc', 'document_upload', 'all', 'Passeport',
     'Copie du passeport en cours de validité (valide 6 mois après le retour).', null),
    ('ast', 'doc', 'document_upload', 'all', 'AST — autorisation de sortie du territoire',
     'Formulaire CERFA 15646 signé par un titulaire de l''autorité parentale, avec copie de sa pièce d''identité.', null),
    ('idp1', 'doc', 'document_upload', 'all', 'Pièce d''identité parent 1',
     'Carte d''identité ou passeport du représentant légal signataire de l''AST.', null),
    ('idp2', 'doc', 'document_upload', 'all', 'Pièce d''identité parent 2',
     'Carte d''identité ou passeport du second représentant légal, le cas échéant.', null),
    ('livret', 'doc', 'document_upload', 'conditional', 'Livret de famille',
     'Pages parents + enfant, demandé uniquement en cas de séparation pour justifier l''autorité parentale.', 'si parents divorcés'),
    ('medical2', 'doc', 'document_upload', 'conditional', 'Formulaire médical complémentaire',
     'Complément demandé lorsque le formulaire de santé signale un traitement ou une allergie sévère.', 'si avis médical requis')
)
insert into form_templates
  (exchange_id, school_id, name, description, type, kind, status, audience,
   standard_key, condition_label, created_by, deadline)
select o.exchange_id, o.school_id, t.name, t.description, t.type, t.kind,
       'draft', t.audience, t.standard_key, t.condition_label, o.user_id, null
from owner o cross join tpl t
where not exists (
  select 1 from form_templates ft
  where ft.exchange_id = o.exchange_id and ft.standard_key = t.standard_key
);

-- One upload slot per backfilled pdf/doc template (label = template name).
insert into document_slots (template_id, label, description, required, "order")
select ft.id, ft.name, null, true, 0
from form_templates ft
where ft.standard_key is not null
  and ft.type = 'document_upload'
  and not exists (select 1 from document_slots ds where ds.template_id = ft.id);

-- Online questions for « Conditions d'accueil ».
insert into form_fields (template_id, label, field_type, required, "order")
select ft.id, f.label, f.field_type, true, f.ord
from form_templates ft
cross join (values
  ('Frères / sœurs au domicile', 'text', 0),
  ('Animaux domestiques', 'text', 1),
  ('Spécificités alimentaires', 'text', 2),
  ('Allergies au domicile', 'text', 3),
  ('Langue(s) parlée(s) en famille', 'text', 4),
  ('Tabac au domicile', 'checkbox', 5),
  ('Chambre individuelle', 'checkbox', 6),
  ('Échange mixte accepté', 'checkbox', 7)
) f(label, field_type, ord)
where ft.standard_key = 'accueil'
  and not exists (select 1 from form_fields x where x.template_id = ft.id);

-- Informational paper checklists for the standard PDF forms (shown in the
-- drawer as « Champs à renseigner »; the student flow ignores form_fields on
-- document_upload templates).
insert into form_fields (template_id, label, field_type, required, "order")
select ft.id, f.label, 'text', true, f.ord
from form_templates ft
join (values
  ('sante', 'Groupe sanguin', 0), ('sante', 'Allergies connues', 1),
  ('sante', 'Traitements en cours', 2), ('sante', 'Régime alimentaire particulier', 3),
  ('sante', 'Vaccins à jour', 4), ('sante', 'Médecin traitant', 5),
  ('sante', 'Personne à prévenir (1)', 6), ('sante', 'Personne à prévenir (2)', 7),
  ('sante', 'Autorisation de soins d''urgence', 8),
  ('decharge', 'Autorisation de participation au programme', 0),
  ('decharge', 'Décharge de responsabilité', 1),
  ('decharge', 'Autorisation de déplacement / transport', 2),
  ('decharge', 'Assurance responsabilité civile', 3),
  ('decharge', 'Signature — représentant légal 1', 4),
  ('decharge', 'Signature — représentant légal 2', 5),
  ('photo', 'Photos de groupe pendant le séjour', 0),
  ('photo', 'Publication sur les réseaux sociaux', 1),
  ('photo', 'Site & supports de l''établissement', 2),
  ('photo', 'Presse locale / partenaires', 3),
  ('photo', 'Signature du représentant légal', 4)
) f(key, label, ord) on f.key = ft.standard_key
where not exists (select 1 from form_fields x where x.template_id = ft.id);
