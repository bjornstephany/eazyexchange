'use client'
import { Button } from '@/components/ui/button'
import { useShellUi } from '@/components/shell/ShellUiContext'

export function EmptyDashboard() {
  const { openNewExchange } = useShellUi()
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
      <h3 className="font-display text-2xl font-bold tracking-tight text-navy">
        Aucun échange pour l&apos;instant
      </h3>
      <p className="text-muted-foreground">Créez votre premier échange pour commencer.</p>
      <Button className="mt-4" onClick={openNewExchange}>
        + Nouvel échange
      </Button>
    </div>
  )
}
