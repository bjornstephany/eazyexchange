-- Which library template an exchange's application was built from.
--
-- Spec: docs/superpowers/specs/2026-07-30-application-tab-redesign-design.md
--
-- NULL means « created before templates existed » and resolves to 'standard'
-- (resolveTemplateId in lib/application-templates/library.ts), so no exchange
-- needs a backfill.
--
-- Stored as its own column rather than a key inside application_fields because
-- provenance and structure are different facts with different lifetimes: the
-- template id must survive an organizer deleting half the questions, and it
-- must survive a document that fails to parse.
alter table exchanges add column application_template text;

comment on column exchanges.application_template is
  'Library template id the application was created from. NULL = pre-templates, resolves to ''standard''. See lib/application-templates/library.ts.';

-- No new grant and no policy change: organizers already hold table-level UPDATE
-- on exchanges (they set application_open / application_deadline /
-- application_fields through the same request-scoped client), and the existing
-- exchange policies scope that to their own school. The column is writable by
-- exactly the right people the moment it exists — proven by the two new cases
-- in tests/rls/matrix.test.ts.
