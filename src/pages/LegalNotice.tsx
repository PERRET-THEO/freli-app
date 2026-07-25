import { LegalPageLayout, LegalParagraph, LegalSection } from '../components/layout/LegalPageLayout'
import { SeoHead } from '../components/seo/SeoHead'
import { siteConfig } from '../lib/seo/siteConfig'

export function LegalNotice() {
  const { legal, supportEmail } = siteConfig

  return (
    <LegalPageLayout title="Mentions légales" lastUpdated="25 juillet 2026">
      <SeoHead path="/mentions-legales" />

      <LegalSection title="1. Éditeur du site">
        <LegalParagraph>
          Le site freli.fr et l&apos;application app.freli.fr (« Freli ») sont édités par{' '}
          {legal.legalName ?? "l'équipe Freli"}
          {legal.siret ? ` — SIRET ${legal.siret}` : ''}
          {legal.address ? `, dont le siège est situé ${legal.address}` : ''}.
          {legal.publisher ? ` Directeur de la publication : ${legal.publisher}.` : ''}
        </LegalParagraph>
        <LegalParagraph>
          Contact :{' '}
          <a href={`mailto:${supportEmail}`} className="text-[var(--accent)] hover:underline">
            {supportEmail}
          </a>
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. Hébergement">
        <LegalParagraph>
          Le site est hébergé par Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723,
          États-Unis (vercel.com). Les données applicatives sont hébergées par Supabase (région
          Union européenne).
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="3. Propriété intellectuelle">
        <LegalParagraph>
          L&apos;ensemble des contenus du site (textes, visuels, logo, interface) est protégé par le
          droit de la propriété intellectuelle. Toute reproduction non autorisée est interdite.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="4. Données personnelles">
        <LegalParagraph>
          Le traitement des données personnelles est décrit dans la politique de confidentialité,
          accessible depuis le pied de page du site.
        </LegalParagraph>
      </LegalSection>
    </LegalPageLayout>
  )
}
