import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LEGAL_SLUGS, getLegalDocument } from '@/lib/legal'
import { LegalDocumentView } from '@/components/legal/LegalDocumentView'

export function generateStaticParams() {
  return LEGAL_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const doc = getLegalDocument(slug)
  if (!doc) return {}
  return {
    title: `${doc.title} · Eazyexchange`,
    description: doc.intro ?? doc.title,
  }
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const doc = getLegalDocument(slug)
  if (!doc) notFound()
  return <LegalDocumentView doc={doc} />
}
