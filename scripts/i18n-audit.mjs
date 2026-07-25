#!/usr/bin/env node
// Advisory i18n catalogue audit. Not part of `pnpm test` — the checks that are
// deterministic enough to gate a build live in messages/__tests__/parity.test.ts.
// Run it when touching copy:  node scripts/i18n-audit.mjs
//
// Reports: keys no source file references, values identical to en (candidate
// untranslated strings), quote characters that break the per-locale convention,
// and ASCII apostrophes in fr.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const LOCALES = ['en', 'fr', 'es', 'it', 'de']
const SRC_DIRS = ['app', 'components', 'lib', 'actions']
const SRC_EXT = new Set(['.ts', '.tsx', '.mjs'])

function leaves(obj, prefix = '') {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    return Object.assign({}, ...Object.keys(obj).map((k) =>
      leaves(obj[k], prefix ? `${prefix}.${k}` : k)))
  }
  return { [prefix]: String(obj) }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (SRC_EXT.has(extname(p))) out.push(p)
  }
  return out
}

const catalogs = Object.fromEntries(
  LOCALES.map((l) => [l, leaves(JSON.parse(readFileSync(`messages/${l}.json`, 'utf8')))]))

const source = SRC_DIRS.flatMap((d) => walk(d)).map((f) => readFileSync(f, 'utf8')).join('\n')

// A key is "referenced" if the source mentions the full path or ANY suffix of
// it — components call t('settings.program.heading') under a namespace, so the
// leading segments are absent from the call site.
function referenced(path) {
  const parts = path.split('.')
  for (let i = 0; i < parts.length; i++) {
    if (source.includes(parts.slice(i).join('.'))) return true
  }
  return false
}

let findings = 0
const report = (title, items) => {
  if (items.length === 0) return
  findings += items.length
  console.log(`\n${title} (${items.length})`)
  for (const i of items) console.log(`  ${i}`)
}

report('Stale keys — no source reference (delete from ALL five catalogues)',
  Object.keys(catalogs.fr).filter((k) => !referenced(k)))

for (const locale of LOCALES.filter((l) => l !== 'en')) {
  report(`${locale}: values identical to en (check: loanword, or untranslated?)`,
    Object.keys(catalogs[locale]).filter((k) => catalogs[locale][k] === catalogs.en[k]))
}

const QUOTE_RULE = {
  en: [/[«»]/, 'guillemets (en uses “ ”)'],
  de: [/[«»]/, 'guillemets (de uses „ “)'],
  fr: [/„/, 'German quotes (fr uses « »)'],
  es: [/„/, 'German quotes (es uses « »)'],
  it: [/„/, 'German quotes (it uses « »)'],
}
for (const [locale, [re, label]] of Object.entries(QUOTE_RULE)) {
  report(`${locale}: wrong quote characters — ${label}`,
    Object.keys(catalogs[locale]).filter((k) => re.test(catalogs[locale][k])))
}

report('fr: ASCII apostrophes (use ’)',
  Object.keys(catalogs.fr).filter((k) => /\p{L}'\p{L}/u.test(catalogs.fr[k])))

console.log(findings === 0 ? '\ni18n audit: clean.' : `\ni18n audit: ${findings} advisory finding(s).`)
