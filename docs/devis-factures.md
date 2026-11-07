# Module Devis / Factures / Avoirs

## Parcours

- **Menu** : « Devis & factures » (`/dashboard/documents`), onglets Devis / Factures / Avoirs, filtres par statut, recherche, indicateurs (à encaisser, en retard, encaissé sur l'année, devis en attente).
- **Fiche client** : panneau « Devis & factures » avec raccourcis « + Devis » / « + Facture ».
- **Éditeur** (`/dashboard/documents/nouveau?type=devis|facture&client=…&projet=…`, puis `/dashboard/documents/:id`) :
  lignes (quantité, unité, PU HT, TVA 20/10/5,5/2,1/0 %, remise), totaux en direct, TVA non applicable (art. 293 B), aperçu PDF.
- **Cycle de vie**
  - Devis : brouillon → finalisé (DEV-AAAA-NNNN) → accepté / refusé → converti en facture brouillon.
  - Facture : brouillon → émise (FAC-AAAA-NNNN, date du jour, verrouillée) → payée (réversible) → annulée par un avoir.
  - Avoir : créé depuis une facture émise → émis (AV-AAAA-NNNN) → annule la facture d'origine.
- **Paramètres de facturation** (bouton « Paramètres » de la liste) : délai de paiement (≤ 60 j), validité des devis, TVA par défaut / franchise, IBAN/BIC, pénalités de retard, note de bas de page.

## Règles garanties côté serveur (migration `202611011900_sales_documents.sql`)

- Numérotation continue sans trou par agence / type / année, attribuée uniquement à la finalisation (`finalize_sales_document`).
- Totaux HT/TVA/TTC recalculés par trigger (TVA arrondie par taux) ; jamais acceptés depuis le client.
- Document finalisé : contenu et lignes non modifiables ; facture émise non supprimable.
- Instantanés émetteur / client figés à la finalisation (le PDF d'une facture émise ne change plus).
- RLS par agence (`user_agency_ids()`), RPC `SECURITY DEFINER` avec contrôle d'appartenance, `EXECUTE` retiré à `anon`.

## Tests

- `npm run test:sql` — 83 tests SQL (PGlite) : RLS, isolation multi-agence, numérotation, verrouillage, conversions, avoirs.
- `npx vitest run src/lib/salesDocuments.test.ts src/lib/salesDocumentPdf.test.ts src/pages/SalesDocument*.test.tsx` — calculs, mentions légales, PDF, écrans.

## Hors périmètre (pistes)

- Envoi par e-mail depuis Freli (Resend) avec PDF joint — actuellement « Préparer l'e-mail » ouvre la messagerie.
- Acceptation du devis / paiement de la facture depuis le portail client (signature + Stripe Connect).
- Facture électronique (Factur-X) pour l'obligation 2026-2027.

## Lien devis → projet → paiement → facture

- **Rattacher** : dans l'éditeur de devis, choisir le « Projet lié » (ou « + Devis » depuis la fiche projet, qui pré-remplit client et projet).
- **Accepter** : quand le devis passe « Accepté » (ou est converti en facture), le prix du projet devient le total TTC du devis, tant que le projet n'est pas payé. L'ancien lien Stripe est invalidé automatiquement.
- **Payer** : quand le webhook Stripe marque le projet payé, le trigger `projects_invoice_on_paid` appelle `create_invoice_for_project_payment` :
  - devis accepté (ou envoyé du même montant) → facture issue du devis, finalisée et marquée payée ;
  - pas de devis → facture d'une ligne (nom du projet, TVA selon les paramètres de facturation) ;
  - montants différents → facture brouillon « à vérifier », non numérotée ;
  - acompte, projet sans fiche client → rien n'est créé (facture manuelle).
- Idempotent (référence = session Stripe). Une erreur de facturation ne bloque jamais le passage en « payé ».
- Migrations : `202611021100_quote_project_invoice.sql`, `202611021110_invoice_on_project_paid.sql` ; tests : `npm run test:sql`.

## Cohérence projets ↔ clients (202611021000)

- Rattacher un projet à une fiche client recopie son nom et son email dans le projet.
- Modifier le nom ou l'email d'une fiche client met à jour tous ses projets.
- Un projet « Terminé » repasse « En cours » dès qu'une étape est ajoutée, rouverte ou refusée.
