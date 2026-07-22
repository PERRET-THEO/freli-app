-- Recherche d'entreprises via l'API Recherche d'Entreprises (api.gouv.fr)
-- Cache mutualisé des résultats + colonnes légales sur clients et agencies.

-- Cache partagé entre toutes les agences Frely : clé "siren:{siren}" ou
-- "search:{terme}". Accès service role uniquement (Edge Function).
CREATE TABLE IF NOT EXISTS company_lookup_cache (
  cache_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_lookup_cache_cached_at
  ON company_lookup_cache (cached_at);

ALTER TABLE company_lookup_cache ENABLE ROW LEVEL SECURITY;
-- Aucune policy : seule la service role (qui bypasse RLS) lit/écrit ce cache.

-- Informations légales client enrichies par l'API
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS siren TEXT,
  ADD COLUMN IF NOT EXISTS code_naf TEXT,
  ADD COLUMN IF NOT EXISTS source_donnees_legales TEXT
    CHECK (source_donnees_legales IN ('api_gouv', 'saisie_manuelle'));

-- Informations légales agence enrichies par l'API
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS siren TEXT,
  ADD COLUMN IF NOT EXISTS code_naf TEXT,
  ADD COLUMN IF NOT EXISTS source_donnees_legales TEXT
    CHECK (source_donnees_legales IN ('api_gouv', 'saisie_manuelle'));
