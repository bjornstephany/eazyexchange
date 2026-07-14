'use client'

import { useEffect, useState } from 'react'
import { landingContent } from '@/lib/landing/content'
import { DEFAULT_LOCALE, matchLocale, type Locale } from '@/lib/i18n/config'
import { readLocaleCookie, writeLocaleCookie } from '@/lib/i18n/cookie'
import { LandingNav } from './LandingNav'
import { Hero } from './Hero'
import { Features } from './Features'
import { HowItWorks } from './HowItWorks'
import { Testimonial } from './Testimonial'
import { CtaBand } from './CtaBand'
import { LandingFooter } from './LandingFooter'

export function LandingPage() {
  // First paint (and static prerender) is the default locale; the mount effect
  // upgrades to the persisted cookie, else the negotiated browser language.
  const [lang, setLang] = useState<Locale>(DEFAULT_LOCALE)

  useEffect(() => {
    const stored = readLocaleCookie()
    const browser = matchLocale(navigator.languages ?? navigator.language)
    setLang(stored ?? browser ?? DEFAULT_LOCALE)
  }, [])

  const setLanguage = (l: Locale) => {
    setLang(l)
    writeLocaleCookie(l)
  }

  const t = landingContent[lang]

  return (
    <div className="min-h-screen bg-white font-sans text-[#10203F]">
      <LandingNav nav={t.nav} lang={lang} setLanguage={setLanguage} />
      <main>
        <Hero hero={t.hero} />
        <Features features={t.features} />
        <HowItWorks how={t.how} />
        <Testimonial testimonial={t.testimonial} />
        <CtaBand cta={t.cta} />
      </main>
      <LandingFooter footerTag={t.footerTag} />
    </div>
  )
}
