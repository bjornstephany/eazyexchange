import { cn } from '@/lib/utils'
import type { TemplateKind } from '@/lib/forms/rollup'

// 42px icon square: navy for pdf/doc, brand blue for online (per handoff).
export function TemplateIcon({ kind, className }: { kind: TemplateKind; className?: string }) {
  return (
    <div
      className={cn(
        'flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[11px]',
        kind === 'online' ? 'bg-brand' : 'bg-rail',
        className
      )}
    >
      {kind === 'doc' ? (
        <div className="relative h-[17px] w-4">
          <div className="absolute left-0 top-0 h-3.5 w-[11px] rounded-[2px] border-[1.6px] border-white" />
          <div className="absolute bottom-0 right-0 h-3.5 w-[11px] rounded-[2px] border-[1.6px] border-white bg-rail" />
        </div>
      ) : (
        <div className="flex h-[19px] w-[15px] flex-col justify-center gap-[2px] rounded-[2px] border-[1.6px] border-white px-[3px]">
          <div className="h-[1.6px] bg-white" />
          <div className="h-[1.6px] w-[70%] bg-white" />
          {kind === 'pdf' && <div className="h-[1.6px] bg-white" />}
        </div>
      )}
    </div>
  )
}
