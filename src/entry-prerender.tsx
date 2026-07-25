/**
 * Entrée SSR utilisée uniquement par scripts/prerender.mjs au build.
 * Rend le HTML des routes marketing + les balises head par route, afin que
 * les crawlers reçoivent le contenu complet sans exécuter de JavaScript.
 */
import { MotionConfig } from 'motion/react'
import { renderToString } from 'react-dom/server'
import { Route, Routes } from 'react-router-dom'
import { StaticRouter } from 'react-router-dom/server'
import { About } from './pages/About'
import { Demo } from './pages/Demo'
import { Faq } from './pages/Faq'
import { Landing } from './pages/Landing'
import { LegalNotice } from './pages/LegalNotice'
import { PrivacyPolicy } from './pages/PrivacyPolicy'
import { TermsOfUse } from './pages/TermsOfUse'
import { faqEntries } from './lib/seo/faqContent'
import {
  faqPageJsonLd,
  jsonLdGraph,
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from './lib/seo/jsonLd'
import { canonicalUrl, routesMeta, siteConfig } from './lib/seo/siteConfig'

export const prerenderPaths = [
  '/',
  '/demo',
  '/a-propos',
  '/faq',
  '/mentions-legales',
  '/confidentialite',
  '/conditions-utilisation',
]

export function renderBody(path: string): string {
  return renderToString(
    // reducedMotion="always" force les composants Reveal en mode statique :
    // le HTML prerendu est entièrement visible (pas d'opacity:0 au repos).
    <MotionConfig reducedMotion="always">
      <StaticRouter location={path}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/a-propos" element={<About />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/mentions-legales" element={<LegalNotice />} />
          <Route path="/confidentialite" element={<PrivacyPolicy />} />
          <Route path="/conditions-utilisation" element={<TermsOfUse />} />
        </Routes>
      </StaticRouter>
    </MotionConfig>,
  )
}

function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

function jsonLdForPath(path: string): string | null {
  switch (path) {
    case '/':
      return jsonLdGraph(organizationJsonLd(), websiteJsonLd(), softwareApplicationJsonLd())
    case '/a-propos':
      return jsonLdGraph(organizationJsonLd())
    case '/faq':
      return jsonLdGraph(faqPageJsonLd(faqEntries))
    default:
      return null
  }
}

export function renderHead(path: string): string {
  const route = routesMeta[path] ?? routesMeta['/']
  const title = escapeAttr(route.title)
  const description = escapeAttr(route.description)
  const url = canonicalUrl(path)
  const ogImage = `${siteConfig.siteUrl}${siteConfig.ogImagePath}`
  const jsonLd = jsonLdForPath(path)

  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="${route.type}" />`,
    `<meta property="og:site_name" content="${escapeAttr(siteConfig.name)}" />`,
    `<meta property="og:locale" content="${siteConfig.locale}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
  ]

  if (jsonLd) {
    tags.push(`<script type="application/ld+json">${jsonLd}</script>`)
  }

  return tags.join('\n    ')
}
