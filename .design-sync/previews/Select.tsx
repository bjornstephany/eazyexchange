import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'eazyexchange'

/* Radix portals the open listbox to document.body, so these cards show the
 * trigger — the state the field spends almost all its time in. */
export const Standard = () => (
  <div className="w-[320px] space-y-2">
    <Label htmlFor="classe">Classe</Label>
    <Select>
      <SelectTrigger id="classe">
        <SelectValue placeholder="Choisis une option" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="2nde">Seconde</SelectItem>
        <SelectItem value="1ere">Première</SelectItem>
        <SelectItem value="terminale">Terminale</SelectItem>
      </SelectContent>
    </Select>
  </div>
)

export const AvecValeur = () => (
  <div className="w-[320px] space-y-2">
    <Label htmlFor="rythme">Rythme des relances</Label>
    <Select defaultValue="normale">
      <SelectTrigger id="rythme">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="douce">Douce</SelectItem>
        <SelectItem value="normale">Normale</SelectItem>
        <SelectItem value="insistante">Insistante</SelectItem>
      </SelectContent>
    </Select>
  </div>
)

export const Desactive = () => (
  <div className="w-[320px] space-y-2">
    <Label htmlFor="prog">Programme</Label>
    <Select disabled defaultValue="fc26">
      <SelectTrigger id="prog">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="fc26">France — Canada 2026</SelectItem>
      </SelectContent>
    </Select>
  </div>
)
