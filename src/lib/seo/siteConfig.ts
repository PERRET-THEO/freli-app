import { SUPPORT_EMAIL } from '../support'

/**
 * Identité légale de l'éditeur. Champs `null` tant que non fournis :
 * les mentions légales et le JSON-LD n'émettent que les champs renseignés.
 * TODO: compléter legalName / siret / address dès que disponibles.
 */
export interface LegalIdentity {
  legalName: string | null
  siret: string | null
  address: string | null
  publisher: string | null
}

export interface RouteMeta {
  title: string
  description: string
  /** Type Open Graph de la page. */
  type: 'website' | 'article'
}

export const siteConfig = {
  siteUrl: 'https://www.freli.fr',
  appUrl: 'https://app.freli.fr',
  name: 'Freli',
  tagline: 'Onboarding client simplifié',
  description:
    "Freli automatise l'onboarding client : portail unique, signature électronique, paiements Stripe, sync Google Drive et autofill entreprise via l'API Recherche d'Entreprises.",
  supportEmail: SUPPORT_EMAIL,
  calendlyUrl: 'https://calendly.com/freli/demo',
  locale: 'fr_FR',
  language: 'fr-FR',
  ogImagePath: '/og-image.png',
  logoPath: '/icon-512.png',
  legal: {
    legalName: null,
    siret: null,
    address: null,
    publisher: null,
  } satisfies LegalIdentity as LegalIdentity,
  /** Profils officiels (LinkedIn, X…) pour le JSON-LD Organization et llms.txt. */
  sameAs: [] as string[],
} as const

export const routesMeta: Record<string, RouteMeta> = {
  '/': {
    title: 'Freli — Onboarding client simplifié',
    description: siteConfig.description,
    type: 'website',
  },
  '/demo': {
    title: 'Réserver une démo Freli — 30 minutes',
    description:
      "Réservez une démo de 30 minutes pour voir comment Freli automatise l'onboarding de vos clients : portail unique, signature, paiement Stripe et sync Drive.",
    type: 'website',
  },
  '/a-propos': {
    title: 'À propos de Freli — Qui sommes-nous',
    description:
      "Freli est une plateforme française qui automatise l'onboarding client des freelances et agences : collecte de documents, signature électronique, paiement et relances.",
    type: 'website',
  },
  '/faq': {
    title: 'FAQ Freli — Questions fréquentes',
    description:
      "Réponses aux questions fréquentes sur Freli : fonctionnement, accès sur invitation, signature électronique, paiements Stripe, données et RGPD.",
    type: 'website',
  },
  '/mentions-legales': {
    title: 'Mentions légales — Freli',
    description: 'Mentions légales du site freli.fr : éditeur, hébergeur et contact.',
    type: 'website',
  },
  '/confidentialite': {
    title: 'Politique de confidentialité — Freli',
    description:
      'Politique de confidentialité de Freli : données collectées, finalités, sous-traitants et droits RGPD.',
    type: 'website',
  },
  '/conditions-utilisation': {
    title: "Conditions d'utilisation — Freli",
    description:
      "Conditions d'utilisation du service Freli : accès, responsabilités, propriété intellectuelle et résiliation.",
    type: 'website',
  },
}

export function canonicalUrl(path: string): string {
  const normalized = path === '/' ? '/' : path.replace(/\/$/, '')
  return `${siteConfig.siteUrl}${normalized}`
}
