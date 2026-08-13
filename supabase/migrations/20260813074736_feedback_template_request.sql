-- « Vous ne trouvez pas votre modèle ? » in the application template library
-- lets an organizer send us the form they already use. The file itself is never
-- stored — it travels as a mail attachment and the mail IS the delivery — so
-- this row is only a trace of who asked for what, which is exactly what
-- `feedback` already is. A third type rather than a fourth table.
--
-- Privileges are untouched: the existing INSERT-only policy (own uid, own
-- school) and the service-role-only reads carry over unchanged.
alter table feedback drop constraint feedback_type_check;
alter table feedback add constraint feedback_type_check
  check (type in ('suggestion','bug','template_request'));
