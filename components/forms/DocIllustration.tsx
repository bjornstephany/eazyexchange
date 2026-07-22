import type { IllustrationKey } from '@/lib/forms/doc-illustration'

// Cartoon/sticker artwork for the `doc` card preview zone. Presentational
// only — no state, no data. Every sticker is a text-free 64×64 inline SVG, so
// this component needs no translations. aria-hidden is deliberate: the
// enclosing card button already carries aria-label={vm.name}, and a second
// accessible name would make every doc card announce itself twice.
const NAVY = '#1B3A7A'
const NAVY_DARK = '#12295C'
const MAROON = '#7A2E3C'
const MAROON_DARK = '#5E2230'
const GOLD = '#FFC93C'
const BRAND = '#2456E6'
const BRAND_PALE = '#EAF0FE'
const GREEN = '#34B36B'
const INK = '#A9BBDE'
const SKIN = '#F0C9A8'
const RED = '#D8465A'
const PAPER = '#F4F6FC'

// Gold globe + ruled lines shared by both passport booklets.
function BookletFace() {
  return (
    <>
      <circle cx="34" cy="26" r="9.5" fill="none" stroke={GOLD} strokeWidth="2.2" />
      <path
        d="M34 16.5c-4.5 4.5-4.5 14.5 0 19M34 16.5c4.5 4.5 4.5 14.5 0 19M25 22h18M25 30h18"
        stroke={GOLD} strokeWidth="1.5" fill="none"
      />
      <rect x="26" y="42" width="17" height="3" rx="1.5" fill={GOLD} />
      <rect x="29" y="48" width="11" height="2.4" rx="1.2" fill={GOLD} opacity=".6" />
    </>
  )
}

const ART: Record<IllustrationKey, React.ReactNode> = {
  passport: (
    <>
      <rect x="14" y="7" width="37" height="50" rx="5" fill={NAVY} />
      <rect x="14" y="7" width="6" height="50" rx="3" fill={NAVY_DARK} />
      <BookletFace />
    </>
  ),
  'passport-parent': (
    <>
      <rect x="14" y="7" width="37" height="50" rx="5" fill={MAROON} />
      <rect x="14" y="7" width="6" height="50" rx="3" fill={MAROON_DARK} />
      <circle cx="34" cy="25" r="7" fill={SKIN} />
      <path d="M23 47c2.5-7 7-10.5 11-10.5S42.5 40 45 47z" fill={SKIN} />
      <rect x="26" y="50" width="17" height="2.6" rx="1.3" fill={GOLD} opacity=".8" />
    </>
  ),
  'id-card': (
    <>
      <rect x="5" y="15" width="54" height="34" rx="5" fill={BRAND_PALE} />
      <rect x="5" y="15" width="54" height="8" rx="5" fill={BRAND} />
      <rect x="5" y="19" width="54" height="4" fill={BRAND} />
      <circle cx="21" cy="34" r="6.5" fill={NAVY} />
      <path d="M13 45c1.8-4.6 4.8-7 8-7s6.2 2.4 8 7z" fill={NAVY} />
      <rect x="34" y="30" width="19" height="3" rx="1.5" fill={INK} />
      <rect x="34" y="37" width="13" height="3" rx="1.5" fill={INK} />
    </>
  ),
  photo: (
    <>
      <rect x="9" y="9" width="46" height="46" rx="4" fill="#fff" stroke={INK} strokeWidth="2" />
      <rect x="14" y="14" width="36" height="27" fill={BRAND_PALE} />
      <circle cx="32" cy="24" r="6" fill={NAVY} />
      <path d="M20 41c2.6-6.6 7-10 12-10s9.4 3.4 12 10z" fill={NAVY} />
      <rect x="14" y="46" width="20" height="3" rx="1.5" fill={INK} />
    </>
  ),
  insurance: (
    <>
      <path d="M32 6l20 7v17c0 12-8.4 22-20 28-11.6-6-20-16-20-28V13z" fill={BRAND} />
      <path d="M23 32.5l6.5 6.5L42 25" stroke="#fff" strokeWidth="4" fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  medical: (
    <>
      <rect x="9" y="7" width="46" height="50" rx="5" fill="#fff" stroke={INK} strokeWidth="2" />
      <rect x="26" y="16" width="12" height="30" rx="2.5" fill={RED} />
      <rect x="17" y="25" width="30" height="12" rx="2.5" fill={RED} />
    </>
  ),
  'travel-auth': (
    <>
      <rect x="6" y="14" width="52" height="36" rx="5" fill={BRAND_PALE} />
      <rect x="6" y="14" width="52" height="9" rx="5" fill={BRAND} />
      <rect x="6" y="18" width="52" height="5" fill={BRAND} />
      <circle cx="24" cy="36" r="10" fill={GREEN} />
      <path d="M19.5 36.5l3.5 3.5 6.5-7.5" stroke="#fff" strokeWidth="2.8" fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
      <rect x="38" y="31" width="14" height="3" rx="1.5" fill={INK} />
      <rect x="38" y="38" width="10" height="3" rx="1.5" fill={INK} />
    </>
  ),
  ticket: (
    <>
      <path d="M6 20a4 4 0 014-4h44a4 4 0 014 4v6a6 6 0 000 12v6a4 4 0 01-4 4H10a4 4 0 01-4-4v-6a6 6 0 000-12z"
        fill={GOLD} />
      <path d="M40 16v32" stroke="#fff" strokeWidth="2" strokeDasharray="4 4" />
      <path d="M14 34l16-8-3.5 8 3.5 8z" fill={NAVY} />
      <rect x="45" y="27" width="8" height="2.6" rx="1.3" fill={NAVY} opacity=".55" />
      <rect x="45" y="34" width="8" height="2.6" rx="1.3" fill={NAVY} opacity=".55" />
    </>
  ),
  bank: (
    <>
      <rect x="5" y="15" width="54" height="34" rx="5" fill={NAVY} />
      <rect x="5" y="22" width="54" height="7" fill={NAVY_DARK} />
      <rect x="12" y="34" width="11" height="8" rx="2" fill={GOLD} />
      <rect x="28" y="37" width="24" height="3" rx="1.5" fill="#fff" opacity=".55" />
    </>
  ),
  'address-proof': (
    <>
      <rect x="13" y="24" width="38" height="33" rx="4" fill={PAPER} stroke={INK} strokeWidth="2" />
      <path d="M8 27L32 7l24 20z" fill={BRAND} />
      <rect x="27" y="38" width="10" height="19" rx="2" fill={BRAND} opacity=".55" />
      <rect x="18" y="34" width="7" height="6" rx="1.5" fill={INK} opacity=".7" />
      <rect x="39" y="34" width="7" height="6" rx="1.5" fill={INK} opacity=".7" />
    </>
  ),
  'school-record': (
    <>
      <rect x="11" y="7" width="42" height="50" rx="5" fill="#fff" stroke={INK} strokeWidth="2" />
      <rect x="18" y="17" width="20" height="3.4" rx="1.7" fill={NAVY} />
      <rect x="18" y="26" width="28" height="3" rx="1.5" fill={INK} />
      <rect x="18" y="33" width="22" height="3" rx="1.5" fill={INK} />
      <path d="M32 39l3.1 6.3 7 1-5 4.9 1.2 6.9-6.3-3.3-6.3 3.3 1.2-6.9-5-4.9 7-1z" fill={GOLD} />
    </>
  ),
  generic: (
    <>
      <path d="M14 7h24l12 12v38a3 3 0 01-3 3H14a3 3 0 01-3-3V10a3 3 0 013-3z" fill="#fff"
        stroke={INK} strokeWidth="2" />
      <path d="M38 7v12h12" fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <rect x="18" y="28" width="25" height="3" rx="1.5" fill={INK} />
      <rect x="18" y="36" width="25" height="3" rx="1.5" fill={INK} />
      <rect x="18" y="44" width="16" height="3" rx="1.5" fill={INK} />
    </>
  ),
}

export function DocIllustration({ illustration }: { illustration: IllustrationKey }) {
  return (
    <svg
      width="74" height="74" viewBox="0 0 64 64"
      aria-hidden="true" focusable="false"
      data-testid="doc-illustration" data-illustration={illustration}
    >
      {ART[illustration]}
    </svg>
  )
}
