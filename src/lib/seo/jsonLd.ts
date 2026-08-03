import {
  FRELI_AI_ADDON,
  FRELI_CURRENCY,
  FRELI_SUBSCRIPTION,
} from '../billing/entitlements'
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

function eurosFromCents(cents: number): string {
  return (cents / 100).toFixed(0)
}

export function softwareApplicationJsonLd(): JsonLd {
  const currency = FRELI_CURRENCY.toUpperCase()
  return {
    '@type': 'SoftwareApplication',
    '@id': `${siteConfig.siteUrl}/#software`,
    name: siteConfig.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: siteConfig.siteUrl,
    description: siteConfig.description,
    inLanguage: siteConfig.language,
    offers: [
      {
        '@type': 'Offer',
        '@id': `${siteConfig.siteUrl}/tarifs#offer-monthly`,
        name: `${FRELI_SUBSCRIPTION.name} — mensuel`,
        url: canonicalUrl('/tarifs'),
        price: eurosFromCents(FRELI_SUBSCRIPTION.monthlyAmountCents),
        priceCurrency: currency,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: eurosFromCents(FRELI_SUBSCRIPTION.monthlyAmountCents),
          priceCurrency: currency,
          billingDuration: 'P1M',
          valueAddedTaxIncluded: false,
        },
        description: `${FRELI_SUBSCRIPTION.monthlyLabelHt} / mois. TVA calculée au paiement.`,
      },
      {
        '@type': 'Offer',
        '@id': `${siteConfig.siteUrl}/tarifs#offer-yearly`,
        name: `${FRELI_SUBSCRIPTION.name} — annuel`,
        url: canonicalUrl('/tarifs'),
        price: eurosFromCents(FRELI_SUBSCRIPTION.yearlyAmountCents),
        priceCurrency: currency,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: eurosFromCents(FRELI_SUBSCRIPTION.yearlyAmountCents),
          priceCurrency: currency,
          billingDuration: 'P1Y',
          valueAddedTaxIncluded: false,
        },
        description: `${FRELI_SUBSCRIPTION.yearlyLabelHt} / an (−${FRELI_SUBSCRIPTION.yearlyDiscountPercent} %). TVA calculée au paiement.`,
      },
      {
        '@type': 'Offer',
        '@id': `${siteConfig.siteUrl}/tarifs#offer-ai-monthly`,
        name: `${FRELI_AI_ADDON.name} — mensuel`,
        url: canonicalUrl('/tarifs'),
        price: eurosFromCents(FRELI_AI_ADDON.monthlyAmountCents),
        priceCurrency: currency,
        description: `Add-on optionnel ${FRELI_AI_ADDON.monthlyLabelHt} / mois (${FRELI_AI_ADDON.includedCreditsPerMonth} crédits).`,
      },
    ],
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

export function webPageJsonLd(opts: {
  path: string
  name: string
  description: string
  dateModified?: string
}): JsonLd {
  return compact({
    '@type': 'WebPage',
    '@id': `${canonicalUrl(opts.path)}#webpage`,
    url: canonicalUrl(opts.path),
    name: opts.name,
    description: opts.description,
    inLanguage: siteConfig.language,
    isPartOf: { '@id': `${siteConfig.siteUrl}/#website` },
    about: { '@id': `${siteConfig.siteUrl}/#software` },
    dateModified: opts.dateModified,
  })
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
