import { Badge } from 'eazyexchange'

/* Status vocabulary as it is actually used across the organizer and student
 * portals (DossierView, DocumentUploadForm, submission review). */
export const Statuts = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="success">Validé</Badge>
    <Badge variant="info">En vérification</Badge>
    <Badge variant="danger">À corriger</Badge>
    <Badge variant="neutral">Non soumis</Badge>
    <Badge variant="info">Envoyé</Badge>
  </div>
)

export const Variantes = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="default">default</Badge>
    <Badge variant="secondary">secondary</Badge>
    <Badge variant="destructive">destructive</Badge>
    <Badge variant="outline">outline</Badge>
    <Badge variant="success">success</Badge>
    <Badge variant="info">info</Badge>
    <Badge variant="neutral">neutral</Badge>
    <Badge variant="danger">danger</Badge>
  </div>
)

export const DansUneListe = () => (
  <div className="w-[340px] divide-y divide-border rounded-card border border-border bg-card">
    {[
      ['Décharge de responsabilité', 'success', 'Validé'],
      ['Autorisation de sortie', 'info', 'En vérification'],
      ['Fiche sanitaire', 'danger', 'À corriger'],
    ].map(([label, variant, text]) => (
      <div key={label} className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-foreground">{label}</span>
        <Badge variant={variant as 'success' | 'info' | 'danger'}>{text}</Badge>
      </div>
    ))}
  </div>
)
