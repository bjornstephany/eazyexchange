import Link from 'next/link'
import { getExchange } from '@/actions/exchanges'
import { listApplications } from '@/actions/applications'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function ApplicationsListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [exchange, applications] = await Promise.all([getExchange(id), listApplications(id)])

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-slate-500">
        <Link href={`/exchanges/${id}`}>← Back to {exchange.name}</Link>
      </Button>
      <h1 className="text-2xl font-semibold mb-6">Applications</h1>
      {applications.length === 0 ? (
        <p className="text-sm text-slate-500">No applications submitted yet.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {applications.map(a => {
            const name = `${a.data?.first_name ?? ''} ${a.data?.last_name ?? ''}`.trim() || a.email
            return (
              <Link key={a.id} href={`/exchanges/${id}/applications/${a.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-900">{name}</p>
                  <p className="text-xs text-slate-500">{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : ''}</p>
                </div>
                <Badge variant="outline">{a.status}</Badge>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
