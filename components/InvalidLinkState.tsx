// 2c system state: invalid / expired / already-answered link. Presentational and
// server-safe (rendered by public RSC token pages). No button — no organizer email
// surfaced in public token contexts (decision locked).
export function InvalidLinkState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 text-center">
      <div className="relative h-12 w-16 opacity-55">
        <span className="absolute left-0 top-0 h-11 w-11 rounded-full bg-placeholder" />
        <span className="absolute bottom-0 right-0 h-11 w-11 rounded-full bg-frame mix-blend-multiply" />
      </div>
      <h3 className="font-display text-[32px] font-bold text-navy">{title}</h3>
      <p className="max-w-[520px] text-[17px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}
