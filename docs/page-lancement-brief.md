# Brief technique — Page de lancement Freli (lancement.freli.fr)

> Ce document est prêt à être collé dans Cursor (en une fois, ou section par section). Il a été rédigé après analyse du code actuel de Freli (design system, routing, Supabase, Resend) pour que la page générée soit cohérente avec le reste du produit, et après recherche des bonnes pratiques 2026 pour les pages de lancement / listes d'attente ainsi que des règles RGPD applicables à la collecte d'email en France.

## 0. Contexte

Freli est une plateforme d'onboarding client pour freelances et agences (portail unique, signature électronique, paiement Stripe, sync Google Drive, autofill entreprise via API Recherche d'Entreprises). Le produit existe déjà techniquement ; l'objectif de cette page est de préparer **le lancement public officiel** : construire une liste de personnes à prévenir dès l'ouverture, sur un nouveau sous-domaine **lancement.freli.fr**.

La page doit contenir un formulaire **prénom + email** pour collecter les inscriptions et permettre d'envoyer un email de notification au lancement.

---

## 1. Intégration technique (où et comment)

Ne pas créer un projet à part : réutiliser le repo Freli existant pour hériter automatiquement de la charte graphique, des polices, des composants UI et du pipeline de build. Le projet gère déjà plusieurs sous-domaines sur un seul déploiement Vercel via une détection de `hostname` côté client (voir `src/App.tsx`, fonction `AppRoot`, qui distingue déjà `app.freli.fr` du reste).

Consignes pour Cursor :

1. Dans `src/App.tsx`, dans `AppRoot()`, ajouter une branche :
   ```
   if (host === 'lancement.freli.fr') {
     return <LaunchComingSoon />
   }
   ```
   à placer **avant** le test `app.freli.fr` (ou après, l'ordre n'a pas d'importance tant que les deux hosts restent mutuellement exclusifs).
2. Créer un nouveau composant de page **`src/pages/LaunchComingSoon.tsx`** — page autonome, qui ne réutilise **pas** le `Navbar` marketing complet (voir section 4 — bonne pratique : pas de navigation qui distrait sur une page à conversion unique). Peut rester dans le bundle principal (pas besoin de lazy loading, c'est la page d'entrée du sous-domaine).
3. Ajouter une entrée `'/lancement'` (ou équivalent) dans `routesMeta` (`src/lib/seo/siteConfig.ts`) pour que `SeoHead` dispose d'un titre/description dédiés, et utiliser `<SeoHead path="/lancement" />` dans la page (voir section 8).
4. Domaine : ajouter `lancement.freli.fr` dans Vercel → Project → Domains, et pointer le DNS dessus (**action manuelle de Théo, pas du code** — Cursor n'a pas accès à Vercel/DNS).
5. **Point d'attention à signaler à Cursor** : le build utilise un pré-rendu statique (`vite.prerender.config.ts` + `scripts/prerender.mjs`) qui génère le HTML de la route `/` sans connaître le vrai hostname (donc potentiellement le HTML pré-rendu de la Landing classique, avant hydratation React qui corrige selon le host — exactement le même comportement que pour `app.freli.fr` aujourd'hui). C'est acceptable pour une page de campagne temporaire ; si Théo veut un rendu SEO parfait dès la première peinture, il faudra étendre `scripts/prerender.mjs` pour générer un HTML dédié à ce host — **ne pas le faire par défaut, seulement si demandé**.

---

## 2. Charte graphique à respecter strictement

Tokens définis dans `src/index.css` (variables CSS) et `tailwind.config.js` — **réutiliser ces variables exactement, ne pas introduire de nouvelles couleurs** :

- Fond de page : `var(--surface)` (`#f5f4f0`, beige clair chaleureux) ou `var(--surface-warm)` pour des blocs alternés.
- Texte : `var(--ink)` (`#0d0f14`) pour les titres, `var(--ink-soft)` / `var(--ink-muted)` pour le corps de texte secondaire.
- Couleur d'accent (CTA, liens, focus) : `var(--accent)` (`#5b6ef5`, indigo/bleu), variante claire `var(--accent-light)`, fond doux `var(--accent-soft)`.
- Couleurs secondaires dispo si besoin d'un badge/statut : `var(--mint)` (validation/succès), `var(--amber)` (attention).
- Cartes/formulaire sur fond blanc cassé : `var(--white)` (`#fdfcfa`).
- Rayons de bordure : `var(--radius-sm)` (boutons/inputs), `var(--radius-md)`/`var(--radius-lg)` (cartes), `var(--radius-xl)` (gros blocs hero).
- Police de titres : `font-display` → **Syne** (extra-bold, tracking serré, style affirmé) — déjà chargée dans `index.html` via Google Fonts.
- Police de texte courant : `font-body` → **DM Sans**.
- Header sombre type "app" : `var(--ink)` en fond (cohérent avec le `Navbar` marketing actuel) si on garde un bandeau minimal ; sinon fond clair `var(--surface)`.

Composants UI existants à réutiliser tels quels (`src/components/ui/`) :

- `Button` (variantes `primary` / `secondary`) pour le CTA du formulaire.
- `Input` pour les champs prénom / email.
- `Card` pour envelopper le bloc formulaire (ombre douce déjà définie).
- `Badge` si besoin d'afficher un statut ("Bientôt disponible").

Animations : réutiliser `Reveal` / `RevealStagger` / `RevealStaggerItem` de `src/components/landing/Reveal.tsx` (basés sur `motion/react`, respectent déjà `prefers-reduced-motion`) pour les apparitions au scroll, exactement comme sur la Landing actuelle — ne pas réinventer un système d'animation différent.

Logo : reproduire le bloc logo du `Navbar` actuel (carré `--accent` avec "Fr" + texte "Freli" en `font-display`), ou utiliser `/icon-512.png` si un logo image est préférable en header.

---

## 3. Structure de la page (ordre des sections)

Basé sur les bonnes pratiques 2026 pour les pages de lancement / listes d'attente à fort taux de conversion (headline clair, formulaire au-dessus de la ligne de flottaison, pas de distraction, preuve sociale honnête, FAQ courte) :

1. **En-tête minimal** : juste le logo Freli (pas de menu de navigation complet — une page de conversion unique ne doit pas distraire l'utilisateur avec des liens vers tarifs/FAQ/etc.). Optionnel : un lien discret "Déjà client ? Se connecter" vers `app.freli.fr/signin` si pertinent.
2. **Hero** : titre clair sur le bénéfice concret (pas juste "Rejoignez la liste d'attente" — dire ce que Freli fait et pour qui : onboarding client automatisé pour freelances/agences), sous-titre en une phrase précisant l'annonce du lancement officiel, puis **le formulaire directement visible, sans scroll** (prénom + email + CTA + case RGPD).
3. **Pourquoi Freli / ce que ça change** : 3 à 4 points clés repris du positionnement existant (portail client unique, signature électronique, paiement Stripe intégré, synchronisation Google Drive, autofill SIREN) — réutiliser le ton et les formulations déjà présentes dans `src/lib/seo/siteConfig.ts` et `src/pages/Landing.tsx` pour rester cohérent avec le reste du site.
4. **Comment ça marche après inscription** (3 étapes courtes, ex. "Vous vous inscrivez → Vous recevez l'email d'ouverture en avant-première → Vous activez votre compte").
5. **Élément de réassurance honnête** : ne pas inventer de faux compteurs ("1 254 inscrits !") ni de faux témoignages tant qu'ils ne sont pas réels — c'est explicitement déconseillé par les guides 2026 (ça détruit la confiance si détecté) et risqué juridiquement. Si Théo a de vrais éléments (nombre réel de bêta-testeurs, une citation réelle), les utiliser ; sinon rester sur une réassurance factuelle ("Accès prioritaire à l'ouverture", "Pas de spam, un seul email au lancement").
6. **FAQ courte** (3-5 questions : "Quand Freli sera-t-il disponible ?", "Est-ce payant ?", "Que faites-vous de mon email ?", "J'ai déjà un compte, dois-je m'inscrire ?").
7. **Formulaire répété en bas de page** (deuxième point de conversion pour ceux qui scrollent).
8. **Pied de page minimal** : lien vers mentions légales (`/mentions-legales`) et politique de confidentialité (`/confidentialite`) — pages déjà existantes sur le domaine principal, donc lien absolu vers `https://www.freli.fr/confidentialite` depuis le sous-domaine.

---

## 4. Formulaire d'inscription (prénom + email)

Champs :

- **Prénom** — `type="text"`, `autoComplete="given-name"`, requis, pour pouvoir personnaliser l'email de lancement ("Bonjour {prénom}, Freli est disponible !").
- **Email** — `type="email"`, `autoComplete="email"`, `inputMode="email"`, requis, validation de format côté client **et** côté serveur (ne jamais faire confiance uniquement au client).
- **Case à cocher consentement RGPD, non pré-cochée** (voir section 5 pour le texte exact).
- Champ **honeypot invisible** (ex. `website` en `display:none`, jamais rempli par un humain) pour filtrer une partie des soumissions automatisées, en plus d'une limite de fréquence côté serveur (voir section 6).

UX :

- CTA orienté action, pas générique : "Je réserve ma place" ou "Être prévenu·e du lancement" plutôt que "Envoyer" / "S'inscrire".
- États de champ : focus visible (`focus:ring-2` déjà géré par le composant `Input`), erreur inline sous le champ concerné (ex. "Merci d'indiquer un email valide"), état `disabled` pendant l'envoi.
- État de succès **inline sur la page** (ne pas rediriger vers une autre page) : message clair type "C'est noté, {Prénom} ! Vous recevrez un email dès l'ouverture." + éventuellement un CTA de partage (ex. bouton "copier le lien" ou partage LinkedIn/X) pour capitaliser sur l'effet réseau, cohérent avec les bonnes pratiques de croissance virale des listes d'attente.
- Gestion d'un email déjà inscrit : message neutre et rassurant ("Vous êtes déjà inscrit·e, à bientôt !") plutôt qu'une erreur bloquante.
- Accessibilité : `label` explicite associé à chaque champ (pas seulement un `placeholder`), cible tactile ≥ 44px, ordre de tabulation logique, message d'erreur annoncé via `aria-live` ou `aria-describedby`.
- Mobile : formulaire en une colonne, clavier adapté (`type="email"` déclenche le bon clavier iOS/Android), CTA facilement atteignable au pouce.

---

## 5. Conformité RGPD (obligatoire, France/UE)

Le formulaire collecte des données personnelles (prénom + email) à des fins de prospection/notification : le régime applicable en B2C est l'**opt-in explicite**.

Consignes précises pour Cursor :

- La case de consentement **ne doit jamais être pré-cochée**.
- Texte suggéré à côté de la case : *"J'accepte de recevoir un email de Freli lors de l'ouverture publique du service. [Politique de confidentialité](lien)."* — le lien pointe vers `https://www.freli.fr/confidentialite`.
- Juste sous le formulaire (mentions obligatoires, en petit texte) : rappeler brièvement l'identité du responsable de traitement (Freli), la finalité (vous prévenir du lancement), et le fait que les données ne sont conservées que pour cet usage.
- Stocker la preuve du consentement en base (date/heure + version du texte accepté) — voir table `consent_at` dans la section 6.
- Prévoir un lien de désinscription dans l'email de confirmation/notification envoyé (obligatoire dans chaque email, même transactionnel de ce type).
- Durée de conservation raisonnable : jusqu'au lancement + désinscription possible à tout moment (mentionner dans la politique de confidentialité si elle doit être mise à jour — signaler ce point à Théo, ce n'est pas à Cursor de modifier le texte légal sans validation).

---

## 6. Backend — Supabase + Resend (cohérent avec l'existant)

### 6.1 Nouvelle table Supabase

Créer une migration (`supabase/migrations/<timestamp>_waitlist_signups.sql`) suivant le style des migrations existantes du projet :

- Table `waitlist_signups` : `id` (uuid, pk), `first_name` (text, requis), `email` (text, requis, **unique**, contrainte de format email comme déjà fait pour `clients` — voir `202608041200`/`20260804212744` dans `supabase/migrations`), `source` (text, défaut `'lancement.freli.fr'`), `consent_at` (timestamptz, requis), `notified_at` (timestamptz, nullable — rempli quand l'email de lancement aura été envoyé), `unsubscribed_at` (timestamptz, nullable), `created_at` (timestamptz, défaut `now()`).
- RLS activée : **aucun accès public en lecture/écriture directe** depuis le client (comme pour les autres tables sensibles du projet) ; l'insertion passe exclusivement par l'Edge Function ci-dessous (qui utilise la clé de service côté serveur), jamais par un appel direct `supabase.from('waitlist_signups').insert(...)` depuis le front.

### 6.2 Edge Function `submit-waitlist-signup`

Nouveau dossier `supabase/functions/submit-waitlist-signup/index.ts`, sur le même modèle que les fonctions existantes (`corsHeaders`, `jsonResponse` de `_shared/functionAuth.ts`) :

- Méthode `POST` uniquement, valider `Content-Type`.
- Valider le format de l'email côté serveur (regex simple + longueur raisonnable), rejeter si le prénom est vide.
- Vérifier le champ honeypot : si rempli, retourner un succès silencieux sans rien enregistrer (ne pas révéler à un bot qu'il a été détecté).
- Limiter la fréquence par IP (ex. rate limit basique en mémoire ou table dédiée, ou s'appuyer sur la protection déjà en place côté Supabase si suffisante) pour limiter le spam.
- `upsert` sur `email` (si déjà inscrit, ne pas dupliquer, renvoyer un succès).
- Envoyer l'email de confirmation via **Resend**, en réutilisant les helpers déjà en place (`getResendFrom()`, `assertResendOk()` de `_shared/email.ts`) exactement comme les autres fonctions d'envoi d'email du projet (`send-project-invite`, etc.) — même charte visuelle d'email (logo via `getFreliEmailLogoUrl()`, styles cohérents avec `clientEmailHtml.ts` si un gabarit HTML d'email existe déjà à réutiliser comme base).
- Email de confirmation : objet type "C'est noté, {Prénom} !", corps bref confirmant l'inscription + rappel de la valeur de Freli + lien de désinscription en pied d'email (obligatoire, voir section 5).
- Répondre en JSON avec un statut de succès explicite pour permettre à la page d'afficher l'état "inscription confirmée".

### 6.3 Email de lancement (plus tard, hors scope de cette page)

Ne pas construire l'email d'annonce du lancement maintenant (ce sera un envoi en masse ponctuel le jour J) — juste s'assurer que la table stocke bien `first_name` + `email` + `consent_at` pour pouvoir le faire facilement plus tard (export ou fonction dédiée `send-launch-announcement` à créer le moment venu).

---

## 7. SEO & métadonnées

- Ajouter une entrée `'/lancement'` dans `routesMeta` (`src/lib/seo/siteConfig.ts`) avec un titre du type "Freli arrive bientôt — Soyez prévenu·e du lancement" et une description reprenant la proposition de valeur.
- Utiliser `<SeoHead path="/lancement" />` dans `LaunchComingSoon.tsx`.
- Comme il s'agit du lancement **officiel et public**, la page doit être indexable (pas de `noindex`) : c'est un point d'entrée qui va probablement être partagé (réseaux sociaux, Product Hunt, etc.).
- Prévoir une image Open Graph dédiée si possible (sinon réutiliser `og-image.png` existant en attendant).
- Ajouter `lancement.freli.fr` dans `public/robots.txt` / `sitemap.xml` seulement si Théo souhaite un référencement actif dès maintenant (à confirmer avec lui, ce n'est pas obligatoire pour une page de campagne courte).

---

## 8. Performance, accessibilité, responsive

- Mobile-first : un seul point de conversion visible sans scroll sur mobile (titre + formulaire).
- CTA du formulaire du haut potentiellement en position "sticky" sur mobile si la page est longue (mais pas obligatoire si le formulaire est répété en bas — voir section 3).
- Image(s) hero optimisées (format WebP/AVIF avec fallback), poids limité, `loading="lazy"` sauf pour l'image au-dessus de la ligne de flottaison.
- Respect de `prefers-reduced-motion` déjà géré par le composant `Reveal` — ne pas ajouter d'animations custom qui l'ignoreraient.
- Contrastes de couleur suffisants (le texte `var(--ink-muted)` sur fond `var(--surface)` est déjà validé ailleurs sur le site, à conserver).
- Pas de sur-JS : cette page n'a pas besoin de dépendances supplémentaires, réutiliser React Router + `motion/react` déjà présents dans le projet.

---

## 9. Pièges à éviter (retours d'expérience 2026 sur ce type de page)

- Ne pas demander plus de champs que prénom + email (chaque champ supplémentaire fait chuter le taux de conversion) — prénom est déjà une exception tolérée car il sert à personnaliser l'email, ne pas ajouter "entreprise", "téléphone", etc.
- Ne pas laisser de menu de navigation complet qui détourne l'attention du formulaire.
- Ne pas utiliser de faux compte à rebours ("Plus que 3 jours !") ni de fausse urgence si la date n'est pas fixée et confirmée.
- Ne pas afficher de faux compteurs d'inscrits ou de faux témoignages.
- Ne pas pré-cocher la case de consentement RGPD (illégal en l'état actuel du droit français/européen).
- Ne pas insérer le formulaire dans une nouvelle table publique en lecture/écriture libre (RLS obligatoire, passage uniquement par l'Edge Function).

---

## 10. Checklist de recette avant mise en ligne

- [ ] Formulaire testé sur mobile réel (clavier email, taille des cibles tactiles).
- [ ] Soumission avec email invalide → message d'erreur clair, rien n'est enregistré.
- [ ] Soumission avec un email déjà inscrit → pas de doublon en base, message neutre affiché.
- [ ] Email de confirmation reçu (tester avec Resend en mode sandbox/dev d'abord), lien de désinscription présent et fonctionnel.
- [ ] Case RGPD non pré-cochée, lien vers la politique de confidentialité fonctionnel.
- [ ] Table `waitlist_signups` non accessible publiquement (vérifier les policies RLS depuis le dashboard Supabase).
- [ ] Lighthouse mobile ≥ 90 en performance et accessibilité.
- [ ] Navigation clavier complète du formulaire (Tab, Enter pour soumettre).
- [ ] `lancement.freli.fr` pointé et actif côté Vercel/DNS, HTTPS actif.
- [ ] Vérification visuelle : cohérence exacte avec la charte (polices Syne/DM Sans chargées, couleurs `--accent`/`--ink`/`--surface`, rayons de bordure, ombres des cartes).

---

## 11. Prompt prêt à coller dans Cursor

*(Théo peut copier tel quel ce paragraphe dans Cursor pour démarrer, puis coller les sections détaillées ci-dessus au fur et à mesure des questions de l'IA.)*

> Je veux créer une nouvelle page de lancement pour Freli, servie sur le sous-domaine `lancement.freli.fr` (même repo, même déploiement Vercel que `freli.fr`/`app.freli.fr`). Le but : annoncer le lancement public officiel de Freli et collecter des inscriptions (prénom + email) pour prévenir les gens à l'ouverture. Réutilise strictement la charte graphique existante du projet (tokens CSS dans `src/index.css`, `tailwind.config.js`, composants `Button`/`Input`/`Card` dans `src/components/ui`, animations `Reveal` dans `src/components/landing/Reveal.tsx`, polices Syne/DM Sans). Ajoute la détection de host `lancement.freli.fr` dans `AppRoot` (`src/App.tsx`) sur le modèle de la branche déjà existante pour `app.freli.fr`, crée une page `src/pages/LaunchComingSoon.tsx` sans navigation complète (juste le logo), avec formulaire prénom + email + case de consentement RGPD non pré-cochée, connecté à une nouvelle Edge Function Supabase `submit-waitlist-signup` qui enregistre l'inscription dans une nouvelle table `waitlist_signups` (RLS activée, pas d'accès public direct) et envoie un email de confirmation via Resend en réutilisant les helpers de `supabase/functions/_shared/email.ts`. Respecte les points RGPD et bonnes pratiques UX détaillés dans le document `docs/page-lancement-brief.md` du projet.
