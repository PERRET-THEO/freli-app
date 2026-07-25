import { canonicalUrl, routesMeta, siteConfig } from '../../lib/seo/siteConfig'

interface SeoHeadProps {
  /** Chemin canonique de la page (ex. '/demo'). Doit exister dans routesMeta. */
  path: string
  /** Surcharges ponctuelles des métas de la route. */
  title?: string
  description?: string
  /** Graphe JSON-LD sérialisé (via jsonLdGraph). */
  jsonLd?: string
  /** Passe la page en noindex (pages non destinées aux SERP). */
  noindex?: boolean
}

/**
 * Métadonnées par route. React 19 hoiste automatiquement <title>, <meta> et
 * <link> vers le <head> du document — aucun provider nécessaire.
 */
export function SeoHead({ path, title, description, jsonLd, noindex }: SeoHeadProps) {
  // Au prerender (build SSR), les balises head sont injectées statiquement par
  // scripts/prerender.mjs — on ne rend rien pour éviter les doublons dans le body.
  if (import.meta.env.SSR) return null

  const route = routesMeta[path]
  const resolvedTitle = title ?? route?.title ?? routesMeta['/'].title
  const resolvedDescription = description ?? route?.description ?? siteConfig.description
  const url = canonicalUrl(path)
  const ogImage = `${siteConfig.siteUrl}${siteConfig.ogImagePath}`

  return (
    <>
      <title>{resolvedTitle}</title>
      <meta name="description" content={resolvedDescription} />
      <link rel="canonical" href={url} />
      {noindex ? <meta name="robots" content="noindex, nofollow" /> : null}

      <meta property="og:type" content={route?.type ?? 'website'} />
      <meta property="og:site_name" content={siteConfig.name} />
      <meta property="og:locale" content={siteConfig.locale} />
      <meta property="og:title" content={resolvedTitle} />
      <meta property="og:description" content={resolvedDescription} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={resolvedTitle} />
      <meta name="twitter:description" content={resolvedDescription} />
      <meta name="twitter:image" content={ogImage} />

      {jsonLd ? <script type="application/ld+json">{jsonLd}</script> : null}
    </>
  )
}
