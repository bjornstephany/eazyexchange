import { getExchanges } from '@/actions/exchanges'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function DashboardPage() {
  const exchanges = await getExchanges()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Exchanges</h1>
        <Button asChild><Link href="/exchanges/new">New exchange</Link></Button>
      </div>
      {exchanges.length === 0 && (
        <p className="text-muted-foreground">No exchanges yet. Create your first one.</p>
      )}
      <div className="grid gap-4">
        {exchanges.map(ex => (
          <Card key={ex.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{ex.name}</CardTitle>
                <Badge variant="outline">{ex.year}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {(ex.school_a as any)?.name} ↔ {(ex.school_b as any)?.name}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href={`/exchanges/${ex.id}`}>View →</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
