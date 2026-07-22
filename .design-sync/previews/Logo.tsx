import { Logo } from 'eazyexchange'

/* href={null} renders the lockup without the surrounding link — the form used
 * wherever the logo isn't a navigation target. */
export const Standard = () => <Logo href={null} />

export const Lien = () => <Logo href="/" />

export const DansUneBarre = () => (
  <div className="flex w-[520px] items-center justify-between rounded-card border border-border bg-card px-5 py-3.5">
    <Logo href={null} />
    <span className="text-sm text-muted-foreground">Se connecter</span>
  </div>
)
