-- Widen applications.language from the original en/fr funnel toggle to the full
-- supported locale set (i18n Phase 3). The column keeps its 'en' default and its
-- not-null constraint; only the domain grows, so every existing row stays valid.
alter table applications
  drop constraint if exists applications_language_check;

alter table applications
  add constraint applications_language_check
  check (language in ('en', 'fr', 'es', 'it', 'de'));
