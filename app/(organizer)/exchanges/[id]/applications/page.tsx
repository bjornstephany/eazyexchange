import Link from 'next/link'
import { getExchange } from '@/actions/exchanges'
import { listApplications } from '@/actions/applications'
import { applicantName } from '@/lib/application-form'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function ApplicationsListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [exchange, applications] = await Promise.all([getExchange(id), listApplications(id)])

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
        <Link href={`/exchanges/${id}`}>← Back to {exchange.name}</Link>
      </Button>
      <h1 className="text-2xl font-semibold mb-6">Applications</h1>
      {applications.length === 0 ? (
        <p className="text-sm text-muted-foreground">No applications submitted yet.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {applications.map(a => {
            const name = applicantName(a.data) || a.email
            return (
              <Link key={a.id} href={`/exchanges/${id}/applications/${a.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted">
                <div>
                  <p className="text-sm font-medium text-foreground">{name}</p>
                  <p className="text-xs text-muted-foreground">{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : ''}</p>
                </div>
                <Badge variant={
                  a.status === 'accepted' || a.status === 'maybe' || a.status === 'enrolled' ? 'success' :
                  a.status === 'submitted' ? 'info' :
                  a.status === 'rejected' || a.status === 'declined' ? 'danger' : 'neutral'
                }>{a.status}</Badge>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
