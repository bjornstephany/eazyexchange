export type LegalBlock =
  | { t: 'p'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'sub'; text: string }

export interface LegalSection {
  id: string
  heading: string
  blocks: LegalBlock[]
}

export interface LegalDocument {
  slug: string
  title: string
  intro?: string
  lastUpdated: string
  sections: LegalSection[]
}

const TOKEN = '[PLACEHOLDER]'

export function hasPlaceholders(doc: LegalDocument): boolean {
  if (doc.intro?.includes(TOKEN)) return true
  for (const section of doc.sections) {
    if (section.heading.includes(TOKEN)) return true
    for (const block of section.blocks) {
      if (block.t === 'ul') {
        if (block.items.some((i) => i.includes(TOKEN))) return true
      } else if (block.text.includes(TOKEN)) {
        return true
      }
    }
  }
  return false
}
