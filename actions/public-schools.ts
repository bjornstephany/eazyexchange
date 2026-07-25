'use server'
import { createClient } from '@/lib/supabase/server'
import {
  normalizeText, isSearchable, rankSchoolOptions, MAX_RESULTS,
  type SchoolOption,
} from '@/lib/schools/registry'

const REGISTRY_COLUMNS = 'id, uai, name, type, status, commune, postal_code'

// Unauthenticated twin of searchSchools (actions/onboarding.ts) for the signup
// form, which runs before any account exists. Safe to expose: school_registry
// is open government data with a public SELECT policy, already downloadable
// from data.gouv.fr, and it carries no PII.
//
// No rate limiter, deliberately, for the reason already recorded on
// searchSchools: lib/rate-limit fails CLOSED, so a limiter outage would block
// signup entirely — strictly worse than scraping a public dataset.
//
// normalizeText leaves only [a-z0-9 ], so the query can never carry a %, _, *
// or backslash into the LIKE pattern.
export async function searchPublicSchools(query: string): Promise<SchoolOption[]> {
  const q = normalizeText(query ?? '')
  if (!isSearchable(q)) return []

  const supabase = await createClient()
  const run = async (column: 'search_name' | 'search_text', pattern: string) => {
    const { data, error } = await supabase
      .from('school_registry')
      .select(REGISTRY_COLUMNS)
      .like(column, pattern)
      .order('name')
      .limit(MAX_RESULTS)
    if (error) throw error
    return (data ?? []) as SchoolOption[]
  }

  const prefixHits = await run('search_name', `${q}%`)
  const containsHits = await run('search_text', `%${q}%`)
  return rankSchoolOptions(prefixHits, containsHits)
}
