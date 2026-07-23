// Pure helpers for the establishment picker (spec:
// docs/superpowers/specs/2026-07-23-school-registry-signup-gate-design.md).
// No imports on purpose: `scripts/sync-school-registry.mjs` mirrors
// normalizeText line for line and a parity test pins the two together.

export type SchoolOption = {
  id: number
  uai: string
  name: string
  type: string
  status: string | null
  commune: string
  postal_code: string
}

export const MIN_QUERY_LENGTH = 2
export const MAX_RESULTS = 8

// Both sides of the search must agree, so this runs over the stored
// search_name / search_text at sync time AND over the typed query at read time.
// Everything that is not [a-z0-9] collapses to a single space, which
// (a) makes "Saint-Ouen" and "saint ouen" the same string, and (b) means a
// LIKE pattern can never receive a %, _ , * or backslash from user input.
export function normalizeText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function isSearchable(normalized: string): boolean {
  return normalized.length >= MIN_QUERY_LENGTH
}

// Merge the two indexed queries into one ordered list: establishments whose
// name STARTS with the query first, then anything containing it, de-duplicated
// by id and capped.
export function rankSchoolOptions(
  prefixHits: SchoolOption[],
  containsHits: SchoolOption[],
): SchoolOption[] {
  const out: SchoolOption[] = []
  const seen = new Set<number>()
  for (const row of [...prefixHits, ...containsHits]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
    if (out.length === MAX_RESULTS) break
  }
  return out
}

export function formatSchoolOption(o: SchoolOption): string {
  const place = `${o.postal_code} ${o.commune}`
  return o.status ? `${o.name} — ${place} · ${o.status}` : `${o.name} — ${place}`
}
