import { getMyAssignments } from '@/actions/my-forms'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const statusConfig: Record<string, { label: string; variant: 'success' | 'info' | 'neutral' | 'danger' }> = {
  approved: { label: 'Approved', variant: 'success' },
  submitted: { label: 'Submitted', variant: 'info' },
  rejected: { label: 'Rejected — action needed', variant: 'danger' },
  draft: { label: 'In progress', variant: 'neutral' },
}

export default async function MyFormsPage() {
  const assignments = await getMyAssignments()

  const grouped = assignments.reduce<Record<string, typeof assignments>>((acc, a) => {
    const exchangeName = a.form_templates.exchanges.name
    if (!acc[exchangeName]) acc[exchangeName] = []
    acc[exchangeName].push(a)
    return acc
  }, {})

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">My forms</h1>

      {assignments.length === 0 && (
        <p className="text-muted-foreground">No forms assigned yet. Check back after your organizer sets things up.</p>
      )}

      {Object.entries(grouped).map(([exchangeName, items]) => (
        <div key={exchangeName} className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{exchangeName}</h2>
          <div className="grid gap-3">
            {items.map(a => {
              // one-to-one embed: PostgREST returns an object, not an array
              const submission = Array.isArray(a.submissions) ? a.submissions[0] : a.submissions
              const status = submission?.status ?? null
              const cfg = status ? statusConfig[status] : null
              const isOverdue = new Date(a.form_templates.deadline) < new Date() && status !== 'approved'

              return (
                <Card key={a.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base">{a.form_templates.name}</CardTitle>
                      {cfg ? (
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      ) : (
                        <Badge variant="neutral">Not started</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-sm mb-3 ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      {isOverdue ? 'Overdue — ' : 'Due '}
                      {new Date(a.form_templates.deadline).toLocaleDateString()}
                    </p>
                    {status === 'rejected' && submission?.review_note && (
                      <p className="text-sm text-red-700 bg-red-50 rounded px-3 py-2 mb-3">
                        <span className="font-medium">Organizer note:</span> {submission.review_note}
                      </p>
                    )}
                    {status !== 'approved' && (
                      <Button asChild size="sm" variant={status === 'rejected' ? 'destructive' : 'outline'}>
                        <Link href={`/my-forms/${a.id}`}>
                          {status === 'rejected' ? 'Resubmit' : status === 'draft' ? 'Continue' : 'Start'}
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
