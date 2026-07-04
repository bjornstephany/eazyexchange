'use client'

import { useEffect, useState } from 'react'
import { landingContent, type Lang } from '@/lib/landing/content'
import { LandingNav } from './LandingNav'
import { Hero } from './Hero'
import { Features } from './Features'
import { HowItWorks } from './HowItWorks'
import { Testimonial } from './Testimonial'
import { CtaBand } from './CtaBand'
import { LandingFooter } from './LandingFooter'

export function LandingPage() {
  const [lang, setLang] = useState<Lang>('fr')

  useEffect(() => {
    const stored = window.localStorage.getItem('ee_lang')
    if (stored === 'fr' || stored === 'en') setLang(stored)
  }, [])

  const setLanguage = (l: Lang) => {
    setLang(l)
    try {
      window.localStorage.setItem('ee_lang', l)
    } catch {
      /* private mode / storage disabled */
    }
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
