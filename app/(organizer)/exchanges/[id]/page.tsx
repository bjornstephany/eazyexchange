import { getExchange, getExchangeGrid } from '@/actions/exchanges'
import { listApplications } from '@/actions/applications'
import { ApplicationsCard } from '@/components/ApplicationsCard'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const statusConfig: Record<string, { label: string; variant: 'success' | 'info' | 'neutral' | 'danger' }> = {
  approved: { label: 'Approved', variant: 'success' },
  submitted: { label: 'Submitted', variant: 'info' },
  rejected: { label: 'Rejected', variant: 'danger' },
  draft: { label: 'Draft', variant: 'neutral' },
}

export default async function ExchangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [exchange, { templates, students, cellMap }, applications] = await Promise.all([
    getExchange(id),
    getExchangeGrid(id),
    listApplications(id),
  ])
  const counts = {
    submitted: applications.filter((a: { status: string }) => ['submitted', 'accepted', 'declined', 'maybe', 'enrolled', 'rejected'].includes(a.status)).length,
    toReview: applications.filter((a: { status: string }) => a.status === 'submitted').length,
    accepted: applications.filter((a: { status: string }) => ['accepted', 'maybe', 'enrolled'].includes(a.status)).length,
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            {exchange.school_a?.name} ↔ {exchange.school_b?.name} · {exchange.year}
          </p>
          <h1 className="text-2xl font-semibold">{exchange.name}</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/exchanges/${id}/students`}>Manage students</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/exchanges/${id}/forms/new`}>New form</Link>
          </Button>
        </div>
      </div>

      <ApplicationsCard
        exchangeId={id}
        applySlug={exchange.apply_slug}
        open={exchange.application_open}
        deadline={exchange.application_deadline}
        counts={counts}
      />

      {templates.length === 0 && (
        <p className="text-muted-foreground text-sm mb-6">No form templates yet. Create one to get started.</p>
      )}

      {students.length === 0 && (
        <p className="text-muted-foreground text-sm mb-6">No students invited yet.</p>
      )}

      {templates.length > 0 && students.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 pr-4 font-medium text-muted-foreground w-48">Student</th>
                {templates.map(t => (
                  <th key={t.id} className="text-left py-3 px-3 font-medium text-muted-foreground min-w-36">
                    <Link
                      href={`/exchanges/${id}/forms/${t.id}`}
                      className="hover:underline"
                    >
                      {t.name}
                    </Link>
                    <p className="text-xs font-normal text-muted-foreground mt-0.5">
                      Due {new Date(t.deadline).toLocaleDateString()}
                    </p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map(student => (
                <tr key={student.id} className="border-b hover:bg-muted">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-foreground">
                      {student.full_name || <span className="text-muted-foreground italic">Pending setup</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{student.email}</p>
                  </td>
                  {templates.map(t => {
                    const cell = cellMap[`${student.id}:${t.id}`]
                    if (!cell) return (
                      <td key={t.id} className="py-3 px-3">
                        <span className="text-xs text-muted-foreground">—</span>
                      </td>
                    )
                    const cfg = cell.status ? statusConfig[cell.status] : null
                    return (
                      <td key={t.id} className="py-3 px-3">
                        {cfg ? (
                          <Link href={`/exchanges/${id}/submissions/${cell.assignmentId}`}>
                            <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          </Link>
                        ) : (
                          <Badge variant="neutral">Not started</Badge>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
