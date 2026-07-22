-- Per-exchange "Bonne nouvelle" parent-confirmation email template.
--
-- Nullable: when null, the app falls back to the built-in default template
-- (lib/good-news-template.ts). Written only by an organizer server action
-- (updateGoodNewsTemplate), RLS-scoped to the caller's own school via the
-- existing "organizers update exchanges" UPDATE policy (row-level, whole-row).
-- No new policy or column grant is needed: exchanges has a table-level UPDATE
-- grant, so these columns are writable exactly like reminder_cadence.

alter table exchanges
  add column good_news_subject text,
  add column good_news_body text;
