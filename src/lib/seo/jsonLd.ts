import { canonicalUrl, siteConfig } from './siteConfig'

type JsonLd = Record<string, unknown>

function compact(obj: JsonLd): JsonLd {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => {
      if (v === null || v === undefined) return false
      if (Array.isArray(v) && v.length === 0) return false
      return true
    }),
  )
}

export function organizationJsonLd(): JsonLd {
  return compact({
    '@type': 'Organization',
    '@id': `${siteConfig.siteUrl}/#organization`,
    name: siteConfig.name,
    legalName: siteConfig.legal.legalName,
    url: siteConfig.siteUrl,
    logo: `${siteConfig.siteUrl}${siteConfig.logoPath}`,
    email: siteConfig.supportEmail,
    sameAs: [...siteConfig.sameAs],
  })
}

export function websiteJsonLd(): JsonLd {
  return {
    '@type': 'WebSite',
    '@id': `${siteConfig.siteUrl}/#website`,
    url: siteConfig.siteUrl,
    name: siteConfig.name,
    inLanguage: siteConfig.language,
    publisher: { '@id': `${siteConfig.siteUrl}/#organization` },
  }
}

export function softwareApplicationJsonLd(): JsonLd {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${siteConfig.siteUrl}/#software`,
    name: siteConfig.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: siteConfig.siteUrl,
    description: siteConfig.description,
    inLanguage: siteConfig.language,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      description: 'Accès sur invitation — démo gratuite sur rendez-vous.',
    },
    featureList: [
      "Portail d'onboarding client unique",
      'Signature électronique intégrée',
      'Paiement Stripe Connect en fin d’onboarding',
      'Synchronisation Google Drive',
      "Préremplissage entreprise via l'API Recherche d'Entreprises (data.gouv)",
      'Relances automatiques',
      'Portail white-label à la marque de l’agence',
      'Webhooks sortants (Zapier, Make, n8n)',
    ],
    provider: { '@id': `${siteConfig.siteUrl}/#organization` },
  }
}

export interface FaqEntry {
  question: string
  answer: string
}

export function faqPageJsonLd(entries: FaqEntry[]): JsonLd {
  return {
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  }
}

export interface BreadcrumbItem {
  name: string
  path: string
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  }
}

/** Enveloppe un ou plusieurs nœuds dans un graphe JSON-LD sérialisable. */
export function jsonLdGraph(...nodes: JsonLd[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes })
}
