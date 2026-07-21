import {
  Badge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'eazyexchange'

/* Fabricated demo roster — never real student data. */
const eleves: Array<[string, string, string, 'success' | 'info' | 'danger' | 'neutral', string]> = [
  ['Camille Rousseau', 'camille.r@example.org', '4 / 4', 'success', 'Complet'],
  ['Théo Mercier', 'theo.m@example.org', '3 / 4', 'info', 'En vérification'],
  ['Inès Lambert', 'ines.l@example.org', '2 / 4', 'danger', 'À corriger'],
  ['Noah Bertrand', 'noah.b@example.org', '0 / 4', 'neutral', 'Non commencé'],
]

export const ListeDEleves = () => (
  <Table>
    <TableCaption>Programme France — Canada 2026 · 24 élèves</TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead>Élève</TableHead>
        <TableHead>Adresse e-mail</TableHead>
        <TableHead>Documents</TableHead>
        <TableHead>Statut</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {eleves.map(([nom, email, docs, variant, statut]) => (
        <TableRow key={email}>
          <TableCell className="font-medium">{nom}</TableCell>
          <TableCell className="text-muted-foreground">{email}</TableCell>
          <TableCell>{docs}</TableCell>
          <TableCell>
            <Badge variant={variant}>{statut}</Badge>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
)

export const Simple = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Formulaire</TableHead>
        <TableHead>Date limite</TableHead>
        <TableHead>Remis</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell className="font-medium">Décharge de responsabilité</TableCell>
        <TableCell>12 mars 2026</TableCell>
        <TableCell>22 / 24</TableCell>
      </TableRow>
      <TableRow>
        <TableCell className="font-medium">Autorisation de sortie</TableCell>
        <TableCell>12 mars 2026</TableCell>
        <TableCell>19 / 24</TableCell>
      </TableRow>
      <TableRow>
        <TableCell className="font-medium">Fiche sanitaire de liaison</TableCell>
        <TableCell>28 mars 2026</TableCell>
        <TableCell>11 / 24</TableCell>
      </TableRow>
    </TableBody>
  </Table>
)
