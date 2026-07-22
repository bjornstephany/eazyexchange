import { Label, Textarea } from 'eazyexchange'

export const Standard = () => (
  <div className="w-[380px] space-y-2">
    <Label htmlFor="t-infos">Informations médicales</Label>
    <Textarea id="t-infos" rows={4} placeholder="Allergies, traitements en cours…" />
  </div>
)

export const Rempli = () => (
  <div className="w-[380px] space-y-2">
    <Label htmlFor="t-motif">Motif du refus</Label>
    <Textarea
      id="t-motif"
      rows={4}
      defaultValue={
        'La photo d’identité est trop sombre pour être lisible. Merci d’en téléverser une nouvelle avant le 12 mars.'
      }
    />
  </div>
)

export const Desactive = () => (
  <div className="w-[380px] space-y-2">
    <Label htmlFor="t-off">Commentaire</Label>
    <Textarea id="t-off" rows={3} defaultValue="Dossier validé le 4 mars 2026." disabled />
  </div>
)
