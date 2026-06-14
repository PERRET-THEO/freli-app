import { LegalList, LegalPageLayout, LegalParagraph, LegalSection } from '../components/layout/LegalPageLayout'
import { SUPPORT_EMAIL } from '../lib/support'

export function TermsOfUse() {
  return (
    <LegalPageLayout title="Conditions d'utilisation" lastUpdated="3 juin 2026">
      <LegalSection title="1. Objet">
        <LegalParagraph>
          Les présentes conditions régissent l’accès et l’utilisation de Freli, plateforme SaaS
          destinée aux agences et freelances pour automatiser l’onboarding de leurs clients
          (collecte de documents, signatures, relances, paiements). En créant un compte ou en
          utilisant le service, vous acceptez ces conditions.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. Accès au service">
        <LegalParagraph>
          L’accès à Freli est proposé sur invitation ou souscription. Vous vous engagez à fournir
          des informations exactes et à maintenir la confidentialité de vos identifiants. Toute
          activité réalisée depuis votre compte est réputée effectuée par vous.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="3. Usage autorisé">
        <LegalParagraph>Vous vous engagez à utiliser Freli de manière loyale et conforme à la loi.</LegalParagraph>
        <LegalList
          items={[
            'Ne pas tenter d’accéder aux données d’autres agences ou clients sans autorisation.',
            'Ne pas utiliser le service à des fins illicites, frauduleuses ou contraires aux droits de tiers.',
            'Obtenir le consentement de vos clients avant de collecter leurs données via Freli.',
            'Respecter la réglementation applicable (RGPD, droit de la consommation, signature électronique, etc.).',
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Relation avec vos clients">
        <LegalParagraph>
          En tant qu’agence utilisatrice, vous restez responsable du contenu transmis à vos clients
          (checklists, contrats, montants) et du traitement des données que vous collectez via le
          portail client. Freli agit en qualité de sous-traitant pour les données que vous faites
          traiter pour le compte de vos clients.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="5. Intégrations tierces">
        <LegalParagraph>
          Freli peut se connecter à des services tiers (Stripe, Google Drive, etc.). Leur
          utilisation est soumise aux conditions de ces prestataires. Freli n’est pas responsable
          des interruptions ou modifications de ces services externes.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="6. Disponibilité et évolutions">
        <LegalParagraph>
          Nous nous efforçons d’assurer une disponibilité continue du service, sans garantie
          d’accès ininterrompu. Freli peut faire évoluer ses fonctionnalités ; les modifications
          substantielles seront communiquées dans la mesure du possible.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="7. Propriété intellectuelle">
        <LegalParagraph>
          Freli, son interface, son code et sa marque restent la propriété de l’éditeur. Vous
          conservez la propriété des contenus que vous importez ou générez via la plateforme.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="8. Limitation de responsabilité">
        <LegalParagraph>
          Dans les limites autorisées par la loi, Freli ne saurait être tenu responsable des
          dommages indirects (perte de chiffre d’affaires, perte de données due à une mauvaise
          utilisation, etc.). Notre responsabilité est limitée aux montants payés pour le service
          au cours des douze mois précédant le fait générateur.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="9. Résiliation">
        <LegalParagraph>
          Vous pouvez cesser d’utiliser Freli à tout moment. Nous pouvons suspendre ou résilier un
          compte en cas de violation des présentes conditions ou d’usage abusif, après notification
          lorsque cela est possible.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="10. Droit applicable">
        <LegalParagraph>
          Les présentes conditions sont soumises au droit français. En cas de litige, et à défaut
          d’accord amiable, les tribunaux compétents seront saisis conformément aux règles de droit
          commun.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="11. Contact">
        <LegalParagraph>
          Pour toute question relative à ces conditions :{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--accent)] hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </LegalParagraph>
      </LegalSection>
    </LegalPageLayout>
  )
}
