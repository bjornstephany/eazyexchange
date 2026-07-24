-- The four values the « Bonne nouvelle » acceptance email needs before it can
-- be sent without [à compléter] placeholders. « Dates du séjour » is already
-- held as travel_start/travel_end; these are the other three.
--
-- No policy changes: both policies on exchange_program_details
-- (20260719173549_fillable_forms.sql) are row-level, so new columns inherit
-- them. Organizers of either participating school manage the row; enrolled
-- students read it — correct here, since these are the values their family
-- receives by email.
--
-- participation_cost and payment_details are text, not numeric: real answers
-- are « 850 € par élève, vol et hébergement inclus » or « gratuit ».

alter table exchange_program_details
  add column participation_cost   text,
  add column payment_details      text,
  add column confirmation_deadline date;
