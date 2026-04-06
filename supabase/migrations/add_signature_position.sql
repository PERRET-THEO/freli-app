-- Migration : Ajouter les colonnes de positionnement de la signature
-- À exécuter dans le SQL Editor de Supabase

ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS signature_page INTEGER DEFAULT -1;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS signature_x FLOAT DEFAULT 0.7;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS signature_y FLOAT DEFAULT 0.85;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS signature_width FLOAT DEFAULT 0.25;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS signature_height FLOAT DEFAULT 0.08;
