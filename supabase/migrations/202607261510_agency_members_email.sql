-- Email dénormalisé pour afficher le roster sans lire auth.users côté client.
ALTER TABLE agency_members
  ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE agency_members m
SET email = u.email
FROM auth.users u
WHERE m.user_id = u.id
  AND (m.email IS NULL OR m.email = '');
