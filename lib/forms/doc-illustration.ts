// Which cartoon sticker a `doc` card shows. Pure — no React, no Supabase,
// same conventions as lib/forms/card.ts. Resolution order is fixed:
// standard_key (library entries) → accent-stripped, word-boundary keyword
// match on the organizer's free-text name → 'generic'. A miss degrades to
// the generic sticker; it is never wrong, only unspecific.
import type { TemplateVM } from '@/lib/forms/rollup'

export type IllustrationKey =
  | 'passport' | 'passport-parent' | 'id-card' | 'photo' | 'insurance'
  | 'medical' | 'travel-auth' | 'ticket' | 'bank' | 'address-proof'
  | 'school-record' | 'generic'

// form_templates.standard_key → sticker. Exact; wins over any name keyword.
// A Map (not a Record) so a prototype-valued key can never resolve.
const BY_STANDARD_KEY = new Map<string, IllustrationKey>([
  ['passeport', 'passport'],
  ['passeport-parent', 'passport-parent'],
  ['esta', 'travel-auth'],
])

// Evaluated IN ORDER — first entry with a matching keyword wins. Order is
// load-bearing where vocabularies overlap:
//   'photo' precedes 'id-card'  → « Photo d'identité » is a photo, not a card
//   'passport' precedes 'photo' → « Photo du passeport » is a passport
// Keywords are written already-normalized (lowercase, accent-free) and are
// matched on word boundaries, so "vol" cannot fire inside "bénévolat".
const KEYWORDS: readonly (readonly [IllustrationKey, readonly string[]])[] = [
  ['travel-auth', ['esta', 'visa', 'autorisation de voyage', 'travel authorization', 'travel authorisation']],
  ['passport', ['passeport', 'passport']],
  ['photo', ['photo', 'photographie', 'portrait', 'picture']],
  ['id-card', ['cni', 'identite', 'id card', 'identity card', 'identity']],
  ['insurance', ['assurance', 'mutuelle', 'insurance', 'coverage']],
  ['medical', ['carnet de sante', 'sante', 'vaccin', 'vaccination', 'medical', 'medicale', 'health']],
  ['ticket', ['billet', 'avion', 'vol', 'ticket', 'flight', 'boarding']],
  ['bank', ['rib', 'iban', 'bancaire', 'bank']],
  ['address-proof', ['justificatif de domicile', 'domicile', 'address', 'residence']],
  ['school-record', ['bulletin', 'releve de notes', 'scolarite', 'transcript', 'report card']],
]

// Compiled once at module load: /\bkeyword\b/ over the normalized name.
const MATCHERS: readonly (readonly [IllustrationKey, readonly RegExp[]])[] =
  KEYWORDS.map(([key, words]) => [
    key,
    words.map((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)),
  ])

// Lowercase + strip diacritics so « identité » and "identite" both match.
// Typographic apostrophes are left alone — no keyword contains one.
export function normalizeName(name: string): string {
  // Escape the combining-mark range explicitly — never paste raw combining
  // characters into source, they are invisible and survive copy/paste badly.
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export function docIllustrationKey(
  tpl: Pick<TemplateVM, 'standard_key' | 'name'>,
): IllustrationKey {
  const byKey = tpl.standard_key ? BY_STANDARD_KEY.get(tpl.standard_key) : undefined
  if (byKey) return byKey

  const name = normalizeName(tpl.name ?? '')
  if (name === '') return 'generic'
  for (const [key, patterns] of MATCHERS) {
    if (patterns.some((re) => re.test(name))) return key
  }
  return 'generic'
}
