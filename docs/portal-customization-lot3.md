# Portail — personnalisation Lot 3 (différé)

Documenté dans le plan product ; non implémenté tant que les arbitrages pricing / ops
ne sont pas tranchés. Colonnes / flags envisagés :

- OG image dynamique + favicon dérivé du logo (route Edge / Vercel ImageResponse)
- Choix typographique restreint (2–3 paires auto-hébergées, pas Google Fonts)
- `portal_cover_url` (image de couverture header)
- UI langue portail FR/EN (colonne `portal_locale` déjà créée, défaut `fr`)
- `hide_powered_by` + entitlement add-on white-label (badge Freli reste affiché)
- Sous-domaine `*.freli.fr` puis domaine custom (CNAME + TLS)

Ne pas vendre « white-label complet » tant que le badge est forcé.

Items différés : `og_image`, `fonts`, `cover_image`, `locale_ui`, `hide_powered_by`, `custom_domain`.
