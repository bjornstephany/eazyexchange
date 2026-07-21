import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from 'eazyexchange'

export const Standard = () => (
  <Card className="w-[380px]">
    <CardHeader>
      <CardTitle>France — Canada 2026</CardTitle>
      <CardDescription>Lycée Victor Hugo · 24 élèves inscrits</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">
        Les élèves reçoivent leur checklist personnelle et sont relancés
        automatiquement jusqu&apos;à la date limite.
      </p>
    </CardContent>
    <CardFooter className="gap-3">
      <Button>Ouvrir le programme</Button>
      <Button variant="ghost">Paramètres</Button>
    </CardFooter>
  </Card>
)

export const AvecStatut = () => (
  <Card className="w-[380px]">
    <CardHeader>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>Dossier de Camille Rousseau</CardTitle>
          <CardDescription>3 documents sur 4 remis</CardDescription>
        </div>
        <Badge variant="info" className="shrink-0 whitespace-nowrap">
          En vérification
        </Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-2">
      {[
        ['Décharge de responsabilité', 'success', 'Validé'],
        ['Autorisation de sortie', 'success', 'Validé'],
        ['Fiche sanitaire', 'info', 'En vérification'],
        ['Copie de la pièce d’identité', 'neutral', 'Non soumis'],
      ].map(([label, variant, text]) => (
        <div key={label} className="flex items-center justify-between gap-3">
          <span className="text-sm text-foreground">{label}</span>
          <Badge variant={variant as 'success' | 'info' | 'neutral'}>{text}</Badge>
        </div>
      ))}
    </CardContent>
  </Card>
)

export const Compacte = () => (
  <Card className="w-[260px]">
    <CardHeader className="pb-3">
      <CardDescription>Taux de complétion</CardDescription>
      <CardTitle className="font-display text-3xl">78 %</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">19 dossiers complets sur 24</p>
    </CardContent>
  </Card>
)
