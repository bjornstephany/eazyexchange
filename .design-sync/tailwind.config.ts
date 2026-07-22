import type { Config } from 'tailwindcss'
import base from '../tailwind.config'

// Same theme as the app (single source of truth: ../tailwind.config.ts),
// but content is narrowed to the synced surface plus the authored previews,
// so the compiled stylesheet carries exactly the utilities the cards use.
const config: Config = {
  ...base,
  content: [
    './components/ui/**/*.{ts,tsx}',
    './components/brand/**/*.{ts,tsx}',
    './.design-sync/previews/**/*.{ts,tsx}',
  ],
  // Tailwind only emits utilities it sees used. The design agent composes NEW
  // screens from the brand palette, so the token-derived families must ship
  // whether or not a synced component happens to use them — otherwise the
  // agent writes bg-tint / text-brand and gets silently unstyled output.
  safelist: [
    {
      pattern:
        /^(bg|text|border|ring|fill|stroke|divide)-(navy|brand|tint|success|warn|danger|subtle|hoverrow|hint|placeholder|tertiary|track|frame|rail|ink|paper|cleared|boarding|stamp)(-(DEFAULT|hover|accent|soft|text|border|inactive|card|line|muted|dashed|800|700))?$/,
    },
    {
      pattern:
        /^(bg|text|border|ring)-(background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring)(-foreground)?$/,
    },
    { pattern: /^shadow-(float|modal|sm|md|lg|none)$/ },
    { pattern: /^rounded-(card|pill|sm|md|lg|full|none)$/ },
    { pattern: /^font-(sans|display|mono)$/ },
  ],
}

export default config
