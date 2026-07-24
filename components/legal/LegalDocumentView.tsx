import type { LegalDocument, LegalBlock } from '@/lib/legal'
import { hasPlaceholders } from '@/lib/legal'

function Block({ block }: { block: LegalBlock }) {
  if (block.t === 'p') {
    return <p className="m-0 text-[15px] leading-[1.65] text-[#42506E]">{block.text}</p>
  }
  if (block.t === 'sub') {
    return <h3 className="m-0 mt-2 font-display text-base font-semibold text-[#10203F]">{block.text}</h3>
  }
  return (
    <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-[1.6] text-[#42506E]">
      {block.items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

export function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  const draft = doc.draft === true || hasPlaceholders(doc)
  const updated = new Date(doc.lastUpdated).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return (
    <article className="mx-auto flex max-w-[760px] flex-col gap-7 px-6 py-14">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 font-display text-[32px] font-bold tracking-[-0.02em] text-[#10203F]">{doc.title}</h1>
        <p className="m-0 font-mono text-[13px] text-[#8A97B2]">Dernière mise à jour : {updated}</p>
      </header>

      {draft && (
        <p className="m-0 rounded-[11px] border border-[#F0D48A] bg-[#FCF6E3] px-4 py-3 text-sm leading-[1.55] text-[#8A6D1E]">
          Document en cours de rédaction (brouillon). Certaines informations restent à compléter et le texte
          n’a pas encore de valeur contractuelle définitive.
        </p>
      )}

      {doc.intro && <p className="m-0 text-[15px] leading-[1.65] text-[#5B6B8C]">{doc.intro}</p>}

      {/* No table of contents: these documents are short enough that a link list
          above the text is noise. The section ids below stay so existing deep
          links (/legal/cgv#paiement) keep resolving. */}
      {doc.sections.map((s) => (
        <section key={s.id} id={s.id} className="flex scroll-mt-24 flex-col gap-3">
          <h2 className="m-0 font-display text-[20px] font-bold tracking-[-0.01em] text-[#10203F]">{s.heading}</h2>
          {s.blocks.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </section>
      ))}
    </article>
  )
}
