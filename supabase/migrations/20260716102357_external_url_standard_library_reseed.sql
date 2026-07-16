-- Forms-upload-usable: external instruction link on templates + rework of the
-- standard library to the real 8-item program. Frozen SQL snapshot of the new
-- lib/forms/standard-library.ts (which owns the data for exchanges created
-- from now on) — same approach as 20260703000001.

-- 1 · External link (e.g. ESTA application) ---------------------------------
-- Readable wherever templates already are; no policy changes.
alter table form_templates add column external_url text;

-- 2 · Reseed existing exchanges ----------------------------------------------
-- Drop old-library standard templates still in draft. Drafts have no
-- assignments/submissions by construction (the gated triggers skip drafts);
-- their form_fields/document_slots go with the ON DELETE CASCADE.
-- Active standard templates are left untouched.
delete from form_templates
where standard_key is not null and status = 'draft';

-- Insert the new 8-item set for every existing exchange, skipping any item
-- whose standard_key already exists on that exchange (an active old-library
-- template with a colliding key — decharge/passeport/ast — must not produce a
-- duplicate; the partial unique index form_templates_standard_key_unique
-- enforces the same). created_by = any organizer of the owning school;
-- exchanges without one are skipped.
with owner as (
  select e.id as exchange_id, e.school_a_id as school_id, u.id as user_id
  from exchanges e
  join lateral (
    select id from users
    where school_id = e.school_a_id and role = 'organizer' limit 1
  ) u on true
),
tpl (standard_key, kind, type, audience, name, description, external_url) as (
  values
    ('medical', 'pdf', 'document_upload', 'all', 'Autorisation médicale',
     'Autorisation de soins à télécharger, faire signer par les parents, puis redéposer signée.', null),
    ('decharge', 'pdf', 'document_upload', 'all', 'Décharge de responsabilité / code de conduite',
     'Décharge de responsabilité et code de conduite à signer par la famille et l''élève.', null),
    ('absence', 'pdf', 'document_upload', 'all', 'Demande d''absence',
     'Demande d''absence au lycée pour la durée de l''échange, à faire signer puis redéposer.', null),
    ('famille', 'pdf', 'document_upload', 'all', 'Engagement de famille',
     'Engagement de la famille d''accueil, à signer puis redéposer.', null),
    ('ast', 'pdf', 'document_upload', 'all', 'AST — autorisation de sortie du territoire (CERFA 15646)',
     'Formulaire CERFA 15646 signé par un titulaire de l''autorité parentale. Téléchargez le modèle, faites-le signer, puis redéposez-le.', null),
    ('passeport', 'doc', 'document_upload', 'all', 'Passeport de l''élève',
     'Copie du passeport de l''élève en cours de validité.', null),
    ('passeport-parent', 'doc', 'document_upload', 'all', 'Passeport du parent signataire de l''AST',
     'Copie du passeport du parent qui a signé l''AST — impérativement le même parent.', null),
    ('esta', 'doc', 'document_upload', 'all', 'ESTA — autorisation de voyage États-Unis',
     'Faites la demande ESTA en ligne, puis téléversez la preuve d''autorisation obtenue.', 'https://esta.cbp.dhs.gov')
)
insert into form_templates
  (exchange_id, school_id, name, description, type, kind, status, audience,
   standard_key, condition_label, external_url, created_by, deadline)
select o.exchange_id, o.school_id, t.name, t.description, t.type, t.kind,
       'draft', t.audience, t.standard_key, null, t.external_url, o.user_id, null
from owner o cross join tpl t
where not exists (
  select 1 from form_templates ft
  where ft.exchange_id = o.exchange_id and ft.standard_key = t.standard_key
);

-- One upload slot per standard pdf/doc template lacking one (label = name).
insert into document_slots (template_id, label, description, required, "order")
select ft.id, ft.name, null, true, 0
from form_templates ft
where ft.standard_key is not null
  and ft.type = 'document_upload'
  and not exists (select 1 from document_slots ds where ds.template_id = ft.id);

-- Paper checklists (« Champs à renseigner ») for medical + decharge only.
-- absence/famille/ast seed with no fields (signature-only) — valid because
-- only kind='online' requires fields to activate.
insert into form_fields (template_id, label, field_type, required, "order")
select ft.id, f.label, 'text', true, f.ord
from form_templates ft
join (values
  ('medical', 'Groupe sanguin', 0), ('medical', 'Allergies connues', 1),
  ('medical', 'Traitements en cours', 2), ('medical', 'Régime alimentaire particulier', 3),
  ('medical', 'Vaccins à jour', 4), ('medical', 'Médecin traitant', 5),
  ('medical', 'Personne à prévenir (1)', 6), ('medical', 'Personne à prévenir (2)', 7),
  ('medical', 'Autorisation de soins d''urgence', 8),
  ('decharge', 'Autorisation de participation au programme', 0),
  ('decharge', 'Décharge de responsabilité', 1),
  ('decharge', 'Autorisation de déplacement / transport', 2),
  ('decharge', 'Assurance responsabilité civile', 3),
  ('decharge', 'Signature — représentant légal 1', 4),
  ('decharge', 'Signature — représentant légal 2', 5)
) f(key, label, ord) on f.key = ft.standard_key
where not exists (select 1 from form_fields x where x.template_id = ft.id);
