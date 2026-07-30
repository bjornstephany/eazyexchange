import { cookies } from 'next/headers'
import { getExchanges } from '@/actions/exchanges'
import { getQuestionnaire } from '@/actions/questionnaire'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { QuestionnaireEditor } from '@/components/applications/QuestionnaireEditor'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'

// Scoped to the ACTIVE exchange, like /applications itself: the questionnaire
// belongs to one exchange, and the shell's exchange switcher is how you change
// which one you are editing.
export default async function QuestionnairePage() {
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  const { doc, locked, applicationCount } = await getQuestionnaire(active.id)
  return (
    <QuestionnaireEditor
      exchangeId={active.id}
      initialDoc={doc}
      locked={locked}
      applicationCount={applicationCount}
    />
  )
}
