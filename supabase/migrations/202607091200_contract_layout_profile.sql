-- Profil de mise en page extrait des modèles de référence (phase 2)
ALTER TABLE agency_document_models
  ADD COLUMN IF NOT EXISTS layout_profile JSONB;

COMMENT ON COLUMN agency_document_models.layout_profile IS
  'Variantes CSS pour le rendu HTML des contrats générés (titres, espacement, accent).';
