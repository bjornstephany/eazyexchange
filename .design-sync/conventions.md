# EazyExchange — building with this design system

EazyExchange is a SaaS app for school exchange organizers: they collect forms and
documents from students and parents. The product UI is **French**, so prefer French
copy in screens unless asked otherwise. Realistic content beats lorem ipsum —
programme names ("France — Canada 2026"), document names ("Décharge de
responsabilité"), statuses ("Validé", "En vérification", "À corriger").

## Setup — no provider needed

These components read no React context: there is **no ThemeProvider, no locale
provider, nothing to wrap**. Import a component and render it. All theming comes
from CSS custom properties defined in `styles.css`, so the only requirement is that
`styles.css` is loaded — it `@import`s the compiled component CSS and the brand
fonts (IBM Plex Sans, Schibsted Grotesk, IBM Plex Mono) from Google Fonts.

Three component-specific facts worth knowing:

- **`Mark`** is a bare `<svg>` with no intrinsic size. It always needs sizing
  classes from the caller (`<Mark className="h-10 w-[54px]" />`), aspect ratio 26:19.
  It takes `variant="light" | "dark"` — use `dark` on navy backgrounds.
- **`Logo`** accepts `href`. Pass `href={null}` to render the lockup without a
  surrounding link (use this when the logo isn't a navigation target).
- **`Dialog`** and **`Select`** portal their open content to `document.body`
  (Radix). That's expected — it does not mean the render failed.

## Styling idiom: Tailwind utility classes

This is a **Tailwind CSS + shadcn/ui** system. Style with utility classes; there are
no styling props. Every component accepts `className`, which is merged over its own
classes (`tailwind-merge`), so passing `className` is the correct way to adjust one.

Use the **semantic token classes**, not raw hex — they carry the design language:

| Family | Classes |
|---|---|
| Surfaces | `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-subtle`, `bg-hint`, `bg-hoverrow` |
| Text | `text-foreground`, `text-muted-foreground`, `text-tertiary`, `text-placeholder`, `text-navy` |
| Brand | `bg-brand`, `bg-brand-hover`, `text-brand`, `bg-navy`, `bg-tint`, `text-tint-text`, `border-tint-border` |
| Primary / accent | `bg-primary`, `text-primary-foreground`, `bg-secondary`, `bg-accent`, `bg-destructive` |
| Status | `bg-success` / `text-success-text`, `bg-warn` / `text-warn-text`, `bg-danger` / `text-danger-text` |
| Borders | `border-border`, `border-input`, `border-frame`, `border-frame-dashed`, `ring-ring` |
| Radius | `rounded-card` (18px), `rounded-pill`, `rounded-lg/md/sm` (from `--radius`) |
| Shadow | `shadow-float` (soft lift), `shadow-modal` (dialogs) |
| Type | `font-sans` (IBM Plex Sans, body), `font-display` (Schibsted Grotesk, headings/figures), `font-mono` (IBM Plex Mono) |

Headings and big figures use `font-display` with `font-bold tracking-tight`; body
copy stays `font-sans`. Status colors are always the paired background+text tokens
above, never ad-hoc greens and reds.

## Where the truth lives

- `styles.css` and the CSS it imports — the authoritative token values.
- `components/<group>/<Name>/<Name>.prompt.md` — per-component usage.
- `components/<group>/<Name>/<Name>.d.ts` — the exact props contract.

Read those before styling; they beat any summary here.

## An idiomatic snippet

```jsx
<Card className="w-[380px] shadow-float">
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
    <div className="flex items-center justify-between rounded-md bg-subtle px-3 py-2">
      <span className="text-sm text-foreground">Décharge de responsabilité</span>
      <Badge variant="success">Validé</Badge>
    </div>
  </CardContent>
</Card>
```

`Badge` carries the status vocabulary directly: `success`, `info`, `neutral`,
`danger`, plus `default`, `secondary`, `destructive`, `outline`.
`Button` has `default | secondary | outline | ghost | destructive | link` and sizes
`sm | default | lg | icon`.

Compound components are composed from their parts, all exported:
`Card{Header,Title,Description,Content,Footer}`,
`Dialog{Trigger,Content,Header,Title,Description,Footer,Close}`,
`Select{Trigger,Value,Content,Item,Group,Label,Separator}`,
`Table{Header,Body,Footer,Row,Head,Cell,Caption}`.
