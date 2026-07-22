import { Button } from 'eazyexchange'

export const Variantes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="default">Envoyer les invitations</Button>
    <Button variant="secondary">Enregistrer le brouillon</Button>
    <Button variant="outline">Annuler</Button>
    <Button variant="ghost">Paramètres</Button>
    <Button variant="destructive">Supprimer</Button>
    <Button variant="link">En savoir plus</Button>
  </div>
)

export const Tailles = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="sm">Petit</Button>
    <Button size="default">Normal</Button>
    <Button size="lg">Grand</Button>
  </div>
)

export const Etats = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Relancer</Button>
    <Button disabled>Relancer</Button>
    <Button variant="outline" disabled>
      Annuler
    </Button>
  </div>
)
