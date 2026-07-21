import { Input, Label } from 'eazyexchange'

export const AvecLabel = () => (
  <div className="w-[320px] space-y-2">
    <Label htmlFor="email">Adresse e-mail</Label>
    <Input id="email" type="email" placeholder="prenom.nom@example.org" />
  </div>
)

export const Etats = () => (
  <div className="w-[320px] space-y-4">
    <div className="space-y-2">
      <Label htmlFor="rempli">Nom de l&apos;élève</Label>
      <Input id="rempli" defaultValue="Camille Rousseau" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="vide">Établissement partenaire</Label>
      <Input id="vide" placeholder="Rechercher un établissement" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="desactive">Programme</Label>
      <Input id="desactive" defaultValue="France — Canada 2026" disabled />
    </div>
  </div>
)

export const Types = () => (
  <div className="w-[320px] space-y-4">
    <div className="space-y-2">
      <Label htmlFor="date">Date limite</Label>
      <Input id="date" type="date" defaultValue="2026-03-12" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="fichier">Justificatif</Label>
      <Input id="fichier" type="file" />
    </div>
  </div>
)
