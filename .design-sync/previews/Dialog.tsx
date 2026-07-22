import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Textarea,
} from 'eazyexchange'

/* Radix portals DialogContent to document.body, so the trigger stays in the
 * preview root (keeping it non-empty) while the open dialog paints over the
 * card. Rendered with `open` because hover/click states can't be captured
 * statically. */
export const Ouvert = () => (
  <Dialog open>
    <DialogTrigger asChild>
      <Button variant="outline">Inviter des élèves</Button>
    </DialogTrigger>
    <DialogContent className="max-w-[520px] rounded-card p-[34px] px-[38px] shadow-modal sm:rounded-card">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">
          Inviter des élèves
        </DialogTitle>
        <DialogDescription className="text-[15px] text-muted-foreground">
          Colle une adresse e-mail par ligne. Chaque élève recevra un lien
          personnel pour compléter son dossier.
        </DialogDescription>
      </DialogHeader>
      <Textarea
        rows={5}
        defaultValue={'camille.r@example.org\ntheo.m@example.org\nines.l@example.org'}
      />
      <div className="mt-1.5 flex justify-end gap-3">
        <Button type="button" variant="ghost" className="text-muted-foreground">
          Fermer
        </Button>
        <Button type="button">Envoyer les invitations</Button>
      </div>
    </DialogContent>
  </Dialog>
)
