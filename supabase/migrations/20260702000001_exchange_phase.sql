-- Phase of an exchange's lifecycle, toggled by the organizer from the
-- dashboard stepper. 1 = Recrutement & sélection, 2 = Préparation des dossiers.
-- The existing "organizers update exchanges" RLS policy already permits this
-- update; the guard trigger only blocks school_a_id/school_b_id changes.
alter table exchanges add column phase smallint not null default 1 check (phase in (1, 2));
