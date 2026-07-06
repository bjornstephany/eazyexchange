-- One email = one application per exchange (spec 2026-07-06).
--
-- Cleanup before the unique index: among rows sharing (exchange_id, email),
-- delete only DRAFT rows — a draft is superseded by any newer draft and by any
-- submitted+ row (the real application). Duplicate submitted+ rows are NEVER
-- deleted here: if any exist, the CREATE UNIQUE INDEX below fails and the
-- migration aborts, forcing the manual review the spec requires. Review prod
-- data by hand before pushing this migration (known to contain >= 1 duplicate).

delete from applications a
where a.status = 'draft'
  and exists (
    select 1 from applications b
    where b.exchange_id = a.exchange_id
      and b.email = a.email
      and b.id <> a.id
      and (
        b.status <> 'draft'
        or b.created_at > a.created_at
        or (b.created_at = a.created_at and b.id > a.id)
      )
  );

-- Unconditional (no status frees the email): rejection is final, and a
-- submitted application permanently claims its address for this exchange.
-- startApplication maps the 23505 from a two-tab insert race to the same
-- structured { existing } response it returns from its pre-insert check.
create unique index applications_exchange_email_unique
  on applications (exchange_id, email);
