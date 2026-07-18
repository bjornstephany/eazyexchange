// Pure filtering for the standard-template library drawer. Source of truth
// stays STANDARD_TEMPLATES; the drawer shows the page's family only and greys
// entries the exchange already has.
import { STANDARD_TEMPLATES, type StandardTemplate } from '@/lib/forms/standard-library'

export type LibraryFamily = 'forms' | 'docs'
export type LibraryEntry = StandardTemplate & { added: boolean }

export function libraryEntries(
  family: LibraryFamily,
  existingKeys: readonly string[],
  query: string,
): LibraryEntry[] {
  const kinds: StandardTemplate['kind'][] = family === 'forms' ? ['online', 'pdf'] : ['doc']
  const q = query.trim().toLowerCase()
  return STANDARD_TEMPLATES
    .filter((std) => kinds.includes(std.kind))
    .filter((std) => q === '' || std.name.toLowerCase().includes(q) || std.description.toLowerCase().includes(q))
    .map((std) => ({ ...std, added: existingKeys.includes(std.key) }))
}

export type GroupedLibraryEntries = { forms: LibraryEntry[]; docs: LibraryEntry[] }

// One query filters the whole standard library; entries come back grouped for
// the merged drawer's two subsections (Formulaires = online+pdf, Documents = doc).
export function libraryEntriesGrouped(
  existingKeys: readonly string[],
  query: string,
): GroupedLibraryEntries {
  const q = query.trim().toLowerCase()
  const matches = STANDARD_TEMPLATES
    .filter((std) => q === '' || std.name.toLowerCase().includes(q) || std.description.toLowerCase().includes(q))
    .map((std) => ({ ...std, added: existingKeys.includes(std.key) }))
  return {
    forms: matches.filter((e) => e.kind !== 'doc'),
    docs: matches.filter((e) => e.kind === 'doc'),
  }
}
