-- School registry signup gate (spec: docs/superpowers/specs/2026-07-23-school-registry-signup-gate-design.md).
--
-- A local snapshot of the official French establishment directory
-- (data.education.gouv.fr, dataset fr-en-annuaire-education: open collèges and
-- lycées). Public open government data, zero PII. Refreshed by hand roughly
-- once a term via `pnpm sync:schools`, which does a full replace inside one
-- transaction — so no natural key is needed, which matters because UAI is NOT
-- unique in the source (65 multi-site establishments share a code).

create extension if not exists pg_trgm with schema extensions;

create table school_registry (
  id           bigserial primary key,
  uai          text not null,   -- official RNE/UAI code, e.g. '0690574Z'. Not unique.
  name         text not null,
  type         text not null,   -- 'Collège' | 'Lycée'
  status       text,            -- 'Public' | 'Privé'. Null for 10 rows in the source.
  commune      text not null,
  postal_code  text not null,
  department   text,
  academy      text,
  search_name  text not null,   -- normalizeText(name)              — prefix matching
  search_text  text not null    -- normalizeText(name commune cp)   — contains matching
);

-- `search_name like 'q%'` (best matches first).
create index school_registry_name_prefix_idx
  on school_registry (search_name text_pattern_ops);
-- `search_text like '%q%'` (everything else).
create index school_registry_search_idx
  on school_registry using gin (search_text extensions.gin_trgm_ops);
-- The claim path looks a row up by its UAI.
create index school_registry_uai_idx on school_registry (uai);

alter table school_registry enable row level security;

-- Readable by everyone: it is public open data and the onboarding picker runs
-- before a school exists. No client writes — 20260708000001 set ALTER DEFAULT
-- PRIVILEGES granting insert/update/delete on new public tables, so the revoke
-- below is load-bearing, not decorative.
create policy "school registry is public" on school_registry
  for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on school_registry from anon, authenticated;

-- --- schools: verified establishment identity ---------------------------------
-- uai is null for unverified schools (non-FR, or a legacy row). Deliberately NO
-- foreign key to school_registry: if a school closes and drops out of a future
-- sync, an existing paying customer must not break.
alter table schools
  add column uai     text,
  add column country text not null default 'FR';

-- --- claim_school() -----------------------------------------------------------
-- The ONLY writer of schools.uai / schools.country. Neither column is added to
-- the client UPDATE grant (which still covers only `name`, per 20260701000001),
-- because a client that could set country='XX' would unlock the free-text
-- rename in /settings and undo the whole gate.
--
-- For FR the name is re-derived from school_registry here, so a crafted request
-- cannot spoof the displayed establishment name. Returns the name actually
-- written; returns null when the claim is rejected (unknown UAI, empty foreign
-- name, non-organizer caller) so the caller can surface a structured rejection
-- rather than a redacted thrown error.
create or replace function claim_school(p_country text, p_uai text, p_name text)
  returns text
  language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_name   text;
  v_uai    text;
begin
  v_school := my_school_id();
  if v_school is null or my_role() is distinct from 'organizer' then
    return null;
  end if;

  if p_country = 'FR' then
    -- UAI is NOT unique: 65 codes are shared by multi-site establishments (135
    -- rows). Resolving on the UAI alone would silently store a different campus
    -- than the one the organizer picked — e.g. picking "Lycée Chevreul
    -- Lestonnac — 69007 Lyon" stored "…- Site St Didier — 69370
    -- Saint-Didier-au-Mont-d'Or". So prefer the exact (uai, name) pair.
    -- The name is still re-checked against school_registry rather than trusted,
    -- so a crafted request cannot spoof a name the registry does not carry for
    -- that UAI. Falls back to the lowest id when the caller sends no name, or
    -- when a registry sync has since renamed the row.
    select r.name, r.uai into v_name, v_uai
      from school_registry r
      where r.uai = p_uai
        and r.name = nullif(btrim(coalesce(p_name, '')), '')
      order by r.id
      limit 1;
    if v_name is null then
      select r.name, r.uai into v_name, v_uai
        from school_registry r
        where r.uai = p_uai
        order by r.id
        limit 1;
    end if;
    if v_name is null then return null; end if;
  else
    v_name := nullif(btrim(coalesce(p_name, '')), '');
    v_uai  := null;
    if v_name is null then return null; end if;
    if btrim(coalesce(p_country, '')) = '' then return null; end if;
  end if;

  update schools set name = v_name, uai = v_uai, country = p_country
    where id = v_school;

  return v_name;
end;
$$;

revoke execute on function public.claim_school(text, text, text) from public, anon;
grant execute on function public.claim_school(text, text, text) to authenticated;
