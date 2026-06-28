import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { landingContent } from '@/lib/landing/content'

export function Features() {
  const { title, subtitle, items } = landingContent.features
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-3 text-muted-foreground">{subtitle}</p>
      </div>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.title}>
              <CardHeader>
                <Icon className="size-6 text-primary" aria-hidden />
                <CardTitle className="mt-2 text-lg">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">{item.description}</CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
