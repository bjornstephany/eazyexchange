import { cookies } from 'next/headers'
import { getExchanges, getExchangeGrid } from '@/actions/exchanges'
import { listApplications } from '@/actions/applications-review'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { rollupStudent, type AppRow, type EnrolledStudent } from '@/lib/dashboard/rollup'
import { OverviewView } from '@/components/dashboard/OverviewView'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'

export default async function DashboardPage() {
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  const [applications, grid] = await Promise.all([
    listApplications(active.id),
    getExchangeGrid(active.id),
  ])
  const apps: AppRow[] = applications.map((a: any) => ({
    id: a.id, status: a.status, submitted_at: a.submitted_at, data: a.data ?? {}, email: a.email,
  }))
  const templates = grid.templates.map((t: any) => ({ id: t.id, type: t.type, name: t.name, deadline: t.deadline }))
  const students: EnrolledStudent[] = grid.students.map((s: any) => ({ id: s.id, full_name: s.full_name, email: s.email }))
  const rollups = grid.students.map((s: any) => rollupStudent(s, templates, grid.cellMap))

  return (
    <OverviewView
      exchangeId={active.id}
      apps={apps}
      students={students}
      rollups={rollups}
      templates={templates}
      cellMap={grid.cellMap}
      applicationOpen={!!active.application_open}
      applicationDeadline={active.application_deadline ?? null}
      applySlug={active.apply_slug}
    />
  )
}
