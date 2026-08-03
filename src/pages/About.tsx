import { Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { SeoHead } from '../components/seo/SeoHead'
import { answerBlocks } from '../lib/seo/answerBlocks'
import { breadcrumbJsonLd, jsonLdGraph, organizationJsonLd, webPageJsonLd } from '../lib/seo/jsonLd'
import { routesMeta, siteConfig } from '../lib/seo/siteConfig'

const COMPARISON_ROWS = [
  {
    besoin: 'Collecter les informations client',
    sans: '5 emails et un Google Form à centraliser à la main',
    avec: 'Un lien unique, formulaire prérempli via SIREN/SIRET',
  },
  {
    besoin: 'Récupérer les documents',
    sans: 'Pièces jointes éparpillées entre boîtes mail et Drive',
    avec: 'Dépôt centralisé dans le portail, sync Drive automatique',
  },
  {
    besoin: 'Faire signer le contrat',
    sans: 'Outil de signature séparé (DocuSign) et allers-retours',
    avec: 'Signature électronique intégrée, sans compte client',
  },
  {
    besoin: 'Relancer le client',
    sans: 'Relances manuelles à penser et à rédiger',
    avec: 'Relances automatiques après 48h, sans action de votre part',
  },
  {
    besoin: 'Encaisser',
    sans: 'Facturation et suivi de paiement dans un outil séparé',
    avec: 'Lien Stripe envoyé à la clôture, statut suivi jusqu’au règlement',
  },
]

export function About() {
  const aboutMeta = routesMeta['/a-propos']
  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--white)]">
      <SeoHead
        path="/a-propos"
        jsonLd={jsonLdGraph(
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: 'Accueil', path: '/' },
            { name: 'À propos', path: '/a-propos' },
          ]),
          webPageJsonLd({
            path: '/a-propos',
            name: aboutMeta.title,
            description: aboutMeta.description,
            dateModified: '2026-08-03',
          }),
        )}
      />
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center text-sm font-body text-[var(--surface-warm)] hover:text-[var(--white)]"
        >
          ← Retour à l&apos;accueil
        </Link>

        <h1 className="mt-8 font-display text-4xl font-extrabold tracking-tight">
          À propos de Freli
        </h1>
        <p className="mt-4 text-sm font-body leading-relaxed text-[var(--surface-warm)]">
          {answerBlocks.about}
        </p>

        <div className="mt-8 space-y-10 text-sm font-body leading-relaxed text-[var(--surface-warm)]">
          <section>
            <h2 className="mb-3 font-display text-xl font-bold text-[var(--white)]">
              Qu&apos;est-ce que Freli ?
            </h2>
            <p>
              Freli est une plateforme SaaS française qui automatise l&apos;onboarding client des
              freelances et agences. Elle remplace les chaînes d&apos;emails, les Google Forms et
              les relances manuelles par un portail unique envoyé au client : formulaire,
              documents, signature électronique, paiement Stripe et synchronisation Google Drive,
              au même endroit.
            </p>
            <p className="mt-3">
              Le nom « Freli » désigne ici le produit édité sur freli.fr — à ne pas confondre avec
              d&apos;autres entités homonymes.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl font-bold text-[var(--white)]">
              Pour qui ?
            </h2>
            <p>
              Freli s&apos;adresse aux freelances et agences francophones — web, design, marketing,
              conseil — qui onboardent régulièrement de nouveaux clients. L&apos;objectif : passer
              de 3 heures à 2 minutes de travail par nouveau client, sans changer votre façon de
              travailler.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl font-bold text-[var(--white)]">
              Ce que Freli n&apos;est pas
            </h2>
            <p>
              Freli n&apos;est ni un CRM, ni un outil de facturation, ni une suite de gestion de
              projet. Freli se concentre sur une seule étape — l&apos;onboarding — et se connecte à
              vos outils existants via Stripe, Google Drive et les webhooks (Zapier, Make, n8n).
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl font-bold text-[var(--white)]">
              Freli vs votre stack actuelle
            </h2>
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--ink-soft)]">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--ink-soft)] font-display text-[var(--white)]">
                    <th className="px-4 py-3 font-bold">Besoin</th>
                    <th className="px-4 py-3 font-bold">Sans Freli</th>
                    <th className="px-4 py-3 font-bold">Avec Freli</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.besoin} className="border-b border-[var(--ink-soft)] last:border-0">
                      <td className="px-4 py-3 font-medium text-[var(--white)]">{row.besoin}</td>
                      <td className="px-4 py-3">{row.sans}</td>
                      <td className="px-4 py-3">{row.avec}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4">
              Voir aussi les{' '}
              <Link to="/comparatifs" className="text-[var(--accent)] hover:underline">
                comparatifs Freli vs Content Snare, Clustdoc et stack manuelle
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl font-bold text-[var(--white)]">
              Technologies et sous-traitants
            </h2>
            <p>
              Freli s&apos;appuie sur Stripe (paiements), Supabase (données, hébergées dans
              l&apos;Union européenne), Google Drive (synchronisation de documents), Resend (emails
              transactionnels) et l&apos;API Recherche d&apos;Entreprises de data.gouv.fr
              (préremplissage des données légales).
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl font-bold text-[var(--white)]">Contact</h2>
            <p>
              Écrivez-nous à{' '}
              <a
                href={`mailto:${siteConfig.supportEmail}`}
                className="text-[var(--accent)] hover:underline"
              >
                {siteConfig.supportEmail}
              </a>{' '}
              ou{' '}
              <Link to="/demo" className="text-[var(--accent)] hover:underline">
                réservez une démo de 30 minutes
              </Link>
              . L&apos;accès à Freli se fait sur invitation.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
