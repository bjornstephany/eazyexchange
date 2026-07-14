import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { redirect } from 'next/navigation'
import { getExchanges, getExchangeGrid } from '@/actions/exchanges'
import { listApplications } from '@/actions/applications-review'
import { exchangeCap, TRIAL_EXCHANGE_CAP } from '@/lib/billing/limits'
import { rollupStudent, exchangeProgress, type AppRow } from '@/lib/dashboard/rollup'
import { ExchangesView, type ExchangeCardData } from '@/components/exchanges/ExchangesView'

export default async function ExchangesPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (!profile) redirect('/login')

  const school = profile.schools ?? null

  const exchanges = await getExchanges()

  const exchangesData: ExchangeCardData[] = await Promise.all(
    exchanges.map(async (exchange: any) => {
      const [applications, grid] = await Promise.all([
        listApplications(exchange.id),
        getExchangeGrid(exchange.id),
      ])
      const apps: AppRow[] = applications.map((a: any) => ({
        id: a.id, status: a.status, submitted_at: a.submitted_at, data: a.data ?? {}, email: a.email,
      }))
      const templates = grid.templates.map((t: any) => ({ id: t.id, type: t.type, name: t.name, deadline: t.deadline }))
      const rollups = grid.students.map((s: any) => rollupStudent(s, templates, grid.cellMap))

      const prog = exchangeProgress(apps, rollups)
      const pct = prog.total === 0 ? null : Math.round((prog.done / prog.total) * 100)
      const pctLabel = pct === null ? '—' : prog.label

      return {
        id: exchange.id,
        name: exchange.name,
        year: exchange.year,
        pct,
        pctLabel,
      }
    }),
  )

  const ownedCount = exchanges.filter((e: any) => e.school_a_id === profile.school_id).length
  const atCap = ownedCount >= (school ? exchangeCap(school as never) : TRIAL_EXCHANGE_CAP)

  return <ExchangesView exchangesData={exchangesData} atCap={atCap} />
}
