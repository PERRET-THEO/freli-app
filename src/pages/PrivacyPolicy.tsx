import { LegalList, LegalPageLayout, LegalParagraph, LegalSection } from '../components/layout/LegalPageLayout'
import { SUPPORT_EMAIL } from '../lib/support'

export function PrivacyPolicy() {
  return (
    <LegalPageLayout title="Politique de confidentialité" lastUpdated="3 juin 2026">
      <LegalSection title="1. Responsable du traitement">
        <LegalParagraph>
          Freli (accessible sur freli.fr) est édité par l&apos;équipe Freli. Pour toute question
          relative à vos données personnelles, contactez-nous à{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--accent)] hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. Données que nous collectons">
        <LegalParagraph>Nous traitons les catégories de données suivantes :</LegalParagraph>
        <LegalList
          items={[
            'Comptes agence : nom, email professionnel, mot de passe (hashé), paramètres d’agence.',
            'Données clients : nom, email, documents et réponses transmis via le portail d’onboarding.',
            'Données techniques : logs, adresse IP, identifiants de session, informations de navigation.',
            'Données de paiement : traitées par Stripe ; Freli ne stocke pas vos coordonnées bancaires.',
            'Intégrations : identifiants OAuth (Google Drive, Stripe Connect) et URLs de webhooks sortants que vous configurez (Zapier, Make, etc.).',
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Finalités et bases légales">
        <LegalParagraph>
          Vos données sont utilisées pour fournir le service Freli (exécution du contrat), gérer
          votre compte, envoyer des emails transactionnels (invitations, relances, paiements),
          assurer la sécurité de la plateforme et améliorer le produit (intérêt légitime). Lorsque
          la loi l’exige, nous recueillons votre consentement (ex. cookies non essentiels).
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="4. Sous-traitants">
        <LegalParagraph>
          Nous faisons appel à des prestataires conformes au RGPD, notamment :
        </LegalParagraph>
        <LegalList
          items={[
            'Supabase (hébergement base de données et authentification)',
            'Vercel (hébergement de l’application web)',
            'Resend (envoi d’emails transactionnels)',
            'Stripe (paiements et Stripe Connect)',
            'Google (connexion Google Drive, sur action de l’agence)',
            'Services tiers que vous connectez via webhooks (Zapier, Make, etc.), selon votre configuration',
          ]}
        />
        <LegalParagraph>
          Lorsque vous configurez un webhook sortant, des données clients (nom, email, statut de
          projet, etc.) peuvent être transmises aux services que vous choisissez. Vous restez
          responsable de ces flux et de la conformité de vos outils connectés.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="5. Durée de conservation">
        <LegalParagraph>
          Les données sont conservées pendant la durée de votre abonnement ou de votre relation
          contractuelle, puis archivées ou supprimées conformément aux obligations légales et aux
          délais de prescription applicables.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="6. Vos droits">
        <LegalParagraph>
          Conformément au RGPD, vous disposez d’un droit d’accès, de rectification, d’effacement,
          de limitation, d’opposition et de portabilité. Vous pouvez retirer votre consentement à
          tout moment lorsque le traitement repose sur celui-ci. Pour exercer vos droits, écrivez à{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--accent)] hover:underline">
            {SUPPORT_EMAIL}
          </a>
          . Vous pouvez également introduire une réclamation auprès de la CNIL.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="7. Sécurité">
        <LegalParagraph>
          Nous mettons en œuvre des mesures techniques et organisationnelles adaptées (chiffrement
          HTTPS, contrôle d’accès, hébergement sécurisé) pour protéger vos données contre la perte,
          l’accès non autorisé ou la divulgation.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="8. Modifications">
        <LegalParagraph>
          Cette politique peut être mise à jour. La date de dernière révision est indiquée en haut
          de page. En cas de changement significatif, nous vous en informerons par email ou via
          l’application.
        </LegalParagraph>
      </LegalSection>
    </LegalPageLayout>
  )
}
