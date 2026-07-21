import { Input, Label, Textarea } from 'eazyexchange'

export const Standard = () => (
  <div className="w-[320px] space-y-2">
    <Label htmlFor="nom">Nom de l&apos;élève</Label>
    <Input id="nom" defaultValue="Camille Rousseau" />
  </div>
)

export const SurUnFormulaire = () => (
  <div className="w-[340px] space-y-4">
    <div className="space-y-2">
      <Label htmlFor="f-email">Adresse e-mail du parent</Label>
      <Input id="f-email" type="email" placeholder="parent@example.org" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="f-note">Informations médicales</Label>
      <Textarea id="f-note" rows={3} placeholder="Allergies, traitements en cours…" />
    </div>
  </div>
)

export const ChampDesactive = () => (
  <div className="w-[320px] space-y-2">
    <Label htmlFor="l-desactive">Programme</Label>
    <Input id="l-desactive" defaultValue="France — Canada 2026" disabled />
  </div>
)
