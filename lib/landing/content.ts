import type { LucideIcon } from 'lucide-react'
import {
  ClipboardList,
  LayoutDashboard,
  BellRing,
  FileUp,
  CheckCircle2,
} from 'lucide-react'

export interface CtaLink {
  label: string
  href: string
}

export interface FeatureItem {
  icon: LucideIcon
  title: string
  description: string
}

export interface HowItWorksStep {
  number: number
  title: string
  description: string
}

export interface PricingTier {
  name: string
  price: string
  period: string
  description: string
  features: string[]
  cta: CtaLink
  highlighted: boolean
}

export interface LandingContent {
  nav: {
    brand: string
    login: CtaLink
    getStarted: CtaLink
  }
  hero: {
    headline: string
    subhead: string
    primaryCta: CtaLink
    secondaryCta: CtaLink
  }
  problemSolution: {
    problemTitle: string
    problemBody: string
    solutionTitle: string
    solutionBody: string
  }
  features: {
    title: string
    subtitle: string
    items: FeatureItem[]
  }
  howItWorks: {
    title: string
    subtitle: string
    steps: HowItWorksStep[]
  }
  pricing: {
    title: string
    subtitle: string
    popularLabel: string
    valueProp: {
      headline: string
      body: string
    }
    tiers: PricingTier[]
    note: string
  }
  footer: {
    brand: string
    tagline: string
    links: CtaLink[]
    copyright: string
  }
}

const SIGNUP: CtaLink = { label: 'Get started', href: '/signup' }
const LOGIN: CtaLink = { label: 'Log in', href: '/login' }

export const landingContent: LandingContent = {
  nav: {
    brand: 'EazyExchange',
    login: LOGIN,
    getStarted: SIGNUP,
  },
  hero: {
    headline: "Collect every exchange form, without the chasing.",
    subhead:
      "EazyExchange gives each student a clear checklist of forms and documents to complete — and gives you one dashboard to see who is done and who needs a nudge.",
    primaryCta: SIGNUP,
    secondaryCta: LOGIN,
  },
  problemSolution: {
    problemTitle: "Chasing paperwork shouldn't be your job",
    problemBody:
      "Before every trip, organizers lose hours emailing students and parents for the same forms, re-sending deadlines, and hunting through inboxes to figure out what's still missing.",
    solutionTitle: "A single place to collect it all",
    solutionBody:
      "Students get a personal checklist with deadlines and automatic reminders. You get a live completion dashboard — so you always know exactly where things stand.",
  },
  features: {
    title: "Everything you need to run forms collection",
    subtitle: "Built for exchange organizers, not paperwork.",
    items: [
      {
        icon: ClipboardList,
        title: "Per-student checklists",
        description:
          "Each student sees exactly which forms and documents they owe, with clear deadlines.",
      },
      {
        icon: LayoutDashboard,
        title: "Master dashboard",
        description:
          "Track completion across every student at a glance — drafts, submitted, approved.",
      },
      {
        icon: BellRing,
        title: "Automated reminders",
        description:
          "Paced email reminders ramp up as deadlines approach, so you don't have to nag.",
      },
      {
        icon: FileUp,
        title: "Document collection",
        description:
          "Named upload slots make sure you get the right file for every requirement.",
      },
      {
        icon: CheckCircle2,
        title: "Review & approve",
        description:
          "Approve good submissions or reject with a reason — students are notified instantly.",
      },
    ],
  },
  howItWorks: {
    title: "How it works",
    subtitle: "Set up in minutes and let the reminders do the rest.",
    steps: [
      {
        number: 1,
        title: "Create your exchange",
        description: "Name your program and link the two participating schools.",
      },
      {
        number: 2,
        title: "Build your forms",
        description: "Add data-entry forms and document-upload requirements from templates.",
      },
      {
        number: 3,
        title: "Invite students",
        description: "Invite students and parents by email — they get their checklist instantly.",
      },
      {
        number: 4,
        title: "Track completion",
        description: "Watch the dashboard fill in while automated reminders chase stragglers.",
      },
    ],
  },
  pricing: {
    title: "Pricing that pays for itself",
    subtitle: "Pick the plan that matches how many exchanges you run.",
    popularLabel: "Most popular",
    valueProp: {
      headline: "Organizers spend an average of 60 hours per exchange chasing down forms.",
      body:
        "At a modest $10/hour, that's $600 of your time gone — for a single exchange. EazyExchange does the chasing for you, cutting that cost in half or more. Every plan pays for itself before the first deadline.",
    },
    note: "Annual billing. Prices in USD. Cancel anytime.",
    tiers: [
      {
        name: "Starter",
        price: "$299",
        period: "/ year",
        description: "For the organizer running a single exchange program.",
        features: [
          "1 active exchange",
          "Unlimited students & parents",
          "Form templates & document slots",
          "Automated reminders",
        ],
        cta: SIGNUP,
        highlighted: false,
      },
      {
        name: "Growth",
        price: "$499",
        period: "/ year",
        description: "For organizers juggling a pair of programs each year.",
        features: [
          "Up to 2 active exchanges",
          "Unlimited students & parents",
          "Form templates & document slots",
          "Automated reminders",
          "Priority email support",
        ],
        cta: SIGNUP,
        highlighted: true,
      },
      {
        name: "Scale",
        price: "$599",
        period: "/ year",
        description: "For schools and agencies coordinating several exchanges.",
        features: [
          "3+ active exchanges",
          "Unlimited students & parents",
          "Form templates & document slots",
          "Automated reminders",
          "Priority email support",
        ],
        cta: SIGNUP,
        highlighted: false,
      },
    ],
  },
  footer: {
    brand: "EazyExchange",
    tagline: "Form and document collection for student exchange organizers.",
    links: [LOGIN, SIGNUP],
    // The year is prepended at render time (LandingFooter) so it never freezes
    // at the value captured when this module was first imported.
    copyright: "EazyExchange. All rights reserved.",
  },
}
