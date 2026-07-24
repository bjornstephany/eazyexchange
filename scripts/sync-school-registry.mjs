// Refreshes the school_registry snapshot from the official French
// establishment directory (data.education.gouv.fr, dataset
// fr-en-annuaire-education). Spec:
// docs/superpowers/specs/2026-07-23-school-registry-signup-gate-design.md
//
// Full replace inside ONE transaction: delete + bulk insert. MVCC means no
// concurrent reader ever sees an empty table, and no upsert key is needed —
// which matters because UAI is not unique in the source (65 multi-site
// establishments share a code, and even (uai, name) collides 8 times).
// Nothing holds a foreign key to school_registry, so a full replace is safe.
//
// Not app code: it connects with a direct service-role connection string, so
// lib/supabase/admin's import allowlist is untouched.
//
// Cadence: by hand, roughly once a term.
//
// Run (staging):
//   set -a; source .env.staging; set +a
//   pnpm sync:schools
// Run (prod):
//   SCHOOL_REGISTRY_DB_URL='postgresql://…' pnpm sync:schools
import { pathToFileURL } from 'node:url'
import postgres from 'postgres'

const BASE = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/exports/json'
const WHERE = 'type_etablissement in ("Lycée","Collège") and etat="OUVERT"'
const FIELDS = [
  'identifiant_de_l_etablissement',
  'nom_etablissement',
  'type_etablissement',
  'statut_public_prive',
  'nom_commune',
  'code_postal',
  'libelle_departement',
  'libelle_academie',
]

export const COLUMNS = [
  'uai', 'name', 'type', 'status', 'commune', 'postal_code',
  'department', 'academy', 'search_name', 'search_text',
]

// MUST stay identical to normalizeText in lib/schools/registry.ts — the parity
// test in lib/schools/__tests__/registry.test.ts pins the two together.
export function normalizeText(raw) {
  return String(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const orNull = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim())

export function buildRow(r) {
  const name = String(r.nom_etablissement).trim()
  const commune = String(r.nom_commune).trim()
  const postalCode = String(r.code_postal).trim()
  return {
    uai: String(r.identifiant_de_l_etablissement).trim(),
    name,
    type: String(r.type_etablissement).trim(),
    status: orNull(r.statut_public_prive),
    commune,
    postal_code: postalCode,
    department: orNull(r.libelle_departement),
    academy: orNull(r.libelle_academie),
    search_name: normalizeText(name),
    search_text: normalizeText(`${name} ${commune} ${postalCode}`),
  }
}

async function fetchRegistry() {
  const url = new URL(BASE)
  url.searchParams.set('where', WHERE)
  url.searchParams.set('select', FIELDS.join(','))
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`registry export failed: HTTP ${res.status}`)
  const rows = await res.json()
  if (!Array.isArray(rows)) throw new Error('registry export did not return an array')
  return rows
}

async function main() {
  const dbUrl = process.env.SCHOOL_REGISTRY_DB_URL ?? process.env.STAGING_DB_URL
  if (!dbUrl) {
    console.error(
      'No database URL. Staging: `set -a; source .env.staging; set +a; pnpm sync:schools`.\n' +
      'Prod: `SCHOOL_REGISTRY_DB_URL=postgresql://… pnpm sync:schools`.',
    )
    process.exit(1)
  }
  console.log(`[sync] target: ${new URL(dbUrl).host}`)

  console.log('[sync] fetching the establishment directory…')
  const records = await fetchRegistry()
  const rows = records.map(buildRow)
  // A shrunken export means the upstream filter or dataset changed. Refuse to
  // wipe a good snapshot over it.
  if (rows.length < 10_000) {
    throw new Error(`refusing to replace: export returned only ${rows.length} rows`)
  }
  console.log(`[sync] ${rows.length} establishments`)

  const sql = postgres(dbUrl, { max: 1, onnotice: () => {} })
  try {
    await sql.begin(async (tx) => {
      await tx`delete from school_registry`
      for (let i = 0; i < rows.length; i += 1000) {
        await tx`insert into school_registry ${tx(rows.slice(i, i + 1000), ...COLUMNS)}`
      }
    })
    const [{ count }] = await sql`select count(*)::int as count from school_registry`
    console.log(`[sync] done — school_registry now holds ${count} rows`)
  } finally {
    await sql.end()
  }
}

// Importable (the parity test imports normalizeText/buildRow) without running.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error('[sync] failed:', err); process.exit(1) })
}
