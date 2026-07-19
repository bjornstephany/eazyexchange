import { Linkified } from '@/lib/student/linkify'
import type { StudentInfoCard } from '@/actions/student-info'

export function InfoCardsView({ cards }: { cards: StudentInfoCard[] }) {
  const multiExchange = new Set(cards.map(c => c.exchangeName)).size > 1

  // Preserve the action's ordering while grouping by exchange.
  const groups: { name: string; cards: StudentInfoCard[] }[] = []
  for (const card of cards) {
    const last = groups[groups.length - 1]
    if (last && last.name === card.exchangeName) last.cards.push(card)
    else groups.push({ name: card.exchangeName, cards: [card] })
  }

  return (
    <div>
      <div className="mb-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Infos pratiques</div>
      <h1 className="mb-6 font-display text-[30px] font-bold leading-[1.1] tracking-tight text-navy">Bon à savoir</h1>

      {cards.length === 0 && (
        <div className="rounded-[22px] border border-tint-border bg-tint px-[34px] py-[30px]">
          <div className="font-display text-[18px] font-semibold text-navy">Rien pour l’instant</div>
          <p className="mt-1 text-[15px] leading-relaxed text-foreground">
            Ton organisateur n’a pas encore ajouté d’informations. Reviens plus tard — elles apparaîtront ici.
          </p>
        </div>
      )}

      {groups.map(group => (
        <section key={group.name} className="mb-7">
          {multiExchange && (
            <div className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {group.name}
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            {group.cards.map(card => (
              <div key={card.id} className="rounded-[14px] border bg-card px-5 py-4">
                <div className="font-display text-[15px] font-semibold text-navy">{card.title}</div>
                {card.body && (
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground">
                    <Linkified text={card.body} />
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
