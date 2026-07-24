import { describe, it, expect } from 'vitest'
import { LOCALES } from '@/lib/i18n/config'
import en from '@/messages/en.json'
import fr from '@/messages/fr.json'
import es from '@/messages/es.json'
import itMessages from '@/messages/it.json'
import de from '@/messages/de.json'

// `it` is vitest's test fn — import the Italian catalog under a distinct name.
const catalogs: Record<string, unknown> = { en, fr, es, it: itMessages, de }

// Flatten to sorted "a.b.c" key paths.
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    return Object.keys(obj).sort().flatMap((k) =>
      keyPaths((obj as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k))
  }
  return [prefix]
}
// Collect ICU argument names ({name}, {name, plural/select, …}) from a string.
// Plural/select ARM bodies hold translated text that legitimately differs per
// locale (e.g. `one {échange}` → `one {Austausch}`), so strip those bodies
// first; we only want to verify the real interpolation args weren't dropped or
// renamed. (Arm bodies here are single-level with no nested braces.)
// The lookbehind matters: an arm keyword is a standalone token, never a word
// ending. Without it, Italian "in posizione {position}" has its `{position}`
// swallowed as if `one {…}` were a plural arm, and the arg looks dropped.
function placeholders(s: string): string[] {
  const argsOnly = s.replace(/(?<![\w])(?:=\d+|zero|one|two|few|many|other)\s*\{[^{}]*\}/g, '')
  return [...argsOnly.matchAll(/\{\s*(\w+)/g)].map((m) => m[1]).sort()
}
function leaves(obj: unknown, prefix = ''): Record<string, string> {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    return Object.assign({}, ...Object.keys(obj).map((k) =>
      leaves((obj as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k)))
  }
  return { [prefix]: String(obj) }
}

describe('message catalog parity', () => {
  const ref = keyPaths(fr)

  it('covers all five locales', () => {
    expect(LOCALES.every((l) => l in catalogs)).toBe(true)
  })

  for (const locale of LOCALES) {
    it(`${locale} has the exact same key set as fr`, () => {
      expect(keyPaths(catalogs[locale])).toEqual(ref)
    })
    it(`${locale} has no empty values`, () => {
      const vals = Object.values(leaves(catalogs[locale]))
      expect(vals.every((v) => v.trim().length > 0)).toBe(true)
    })
    it(`${locale} references the same ICU arguments as fr`, () => {
      // Compare the SET of interpolation args, not the count: a language may
      // reference an arg a different number of times for grammatical reasons
      // (fr pluralizes both noun and participle in "{cap} échange(s) utilisé(s)";
      // en's "used" is invariant). Dropping or renaming an arg — the real
      // render-breaking risk — still changes the set and fails.
      const a = leaves(fr); const b = leaves(catalogs[locale])
      for (const key of Object.keys(a)) {
        const expected = [...new Set(placeholders(a[key]))].sort()
        const actual = [...new Set(placeholders(b[key]))].sort()
        expect(actual, `key ${key}`).toEqual(expected)
      }
    })
  }

  it('the organizer sidebar keys exist and are not abbreviated', () => {
    const fl = leaves(fr)
    expect(fl['organizer.shell.nav.applications']).toBe('Candidatures')
    expect(fl['organizer.shell.nav.files']).toBe('Fichiers')
    expect(fl['organizer.shell.nav.communication']).toBe('Communication')
    expect(fl['organizer.shell.exchangeGroup.title']).toBe('Mes échanges')
    expect(fl['organizer.shell.exchangeGroup.add']).toBe('+ Ajouter')
    expect(fl['organizer.shell.exchangeGroup.empty']).toBe('Aucun échange')
    expect(fl['organizer.shell.sidebar.collapse']).toBe('Réduire')
    expect(fl['organizer.shell.sidebar.expand']).toBe('Développer')
  })

  it('the billing upgrade keys exist in French with their ICU arguments', () => {
    const fl = leaves(fr)
    expect(fl['organizer.billing.capReached.heading']).toBe('Votre offre {plan} est complète')
    expect(fl['organizer.billing.capReached.blockedLead'])
      .toBe('Création d’échange bloquée : votre offre actuelle a atteint sa limite.')
    expect(fl['organizer.billing.upgradeCta']).toBe('Passer à {plan}')
    expect(fl['organizer.billing.currentPlanBadge']).toBe('Offre actuelle')
    expect(fl['organizer.billing.delta.more']).toBe('+{n, plural, one {# échange} other {# échanges}}')
    expect(fl['organizer.billing.delta.unlimited']).toBe('Échanges illimités')
    expect(fl['organizer.billing.grace.cta']).toBe('Mettre à jour ma carte')
    expect(fl['organizer.billing.cgv']).toContain('<cgv>')
  })
})
