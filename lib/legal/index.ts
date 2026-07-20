import type { LegalDocument } from './types'
import { mentionsLegales } from './mentions-legales'
import { cgu } from './cgu'
import { cgv } from './cgv'
import { confidentialite } from './confidentialite'

export type { LegalDocument, LegalBlock, LegalSection } from './types'
export { hasPlaceholders } from './types'

export const LEGAL_SLUGS = ['mentions-legales', 'cgu', 'cgv', 'confidentialite'] as const
export type LegalSlug = (typeof LEGAL_SLUGS)[number]

export const LEGAL_DOCUMENTS: Record<LegalSlug, LegalDocument> = {
  'mentions-legales': mentionsLegales,
  cgu,
  cgv,
  confidentialite,
}

export function getLegalDocument(slug: string): LegalDocument | null {
  return (LEGAL_DOCUMENTS as Record<string, LegalDocument>)[slug] ?? null
}
