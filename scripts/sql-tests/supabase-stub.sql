-- Stub minimal de l'environnement Supabase pour tester la migration.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE service_role NOLOGIN;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

CREATE TABLE public.agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, name text NOT NULL, logo_url text, brand_color text,
  contact_email text, contact_phone text, legal_form text, address_street text,
  address_postal_code text, address_city text, siret text, share_capital text,
  vat_number text, rcs_city text, siren text
);
CREATE TABLE public.agency_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id), user_id uuid NOT NULL, role text NOT NULL
);
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES agencies(id), first_name text NOT NULL, last_name text NOT NULL,
  email text NOT NULL, phone text, company_name text, siret text, siren text, vat_number text,
  address_street text, address_postal_code text, address_city text, address_country text
);
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES agencies(id), name text NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  price numeric, payment_status text DEFAULT 'pending',
  amount_type text NOT NULL DEFAULT 'full',
  stripe_checkout_session_id text
);

CREATE FUNCTION public.user_agency_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  SELECT agency_id FROM agency_members WHERE user_id = (SELECT auth.uid())
  UNION
  SELECT id FROM agencies WHERE user_id = (SELECT auth.uid());
$$;

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY a ON agencies FOR SELECT TO authenticated USING (id IN (SELECT user_agency_ids()));
CREATE POLICY c ON clients FOR ALL TO authenticated USING (agency_id IN (SELECT user_agency_ids()))
  WITH CHECK (agency_id IN (SELECT user_agency_ids()));
CREATE POLICY p ON projects FOR ALL TO authenticated USING (agency_id IN (SELECT user_agency_ids()));
GRANT SELECT, INSERT, UPDATE, DELETE ON agencies, clients, projects, agency_members TO authenticated;

-- Données
INSERT INTO agencies (id, user_id, name, legal_form, siret, address_street, address_postal_code, address_city, vat_number)
VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Studio Alpha', 'SASU',
  '12345678900011', '1 rue de la Paix', '42000', 'Saint-Étienne', 'FR12345678900'),
 ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'Agence Beta', 'EURL',
  null, null, null, null, null);
INSERT INTO agency_members (agency_id, user_id, role) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003', 'member');
INSERT INTO clients (id, agency_id, first_name, last_name, email, company_name) VALUES
 ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Marie', 'Durand', 'marie@ex.fr', 'Durand SARL'),
 ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'Paul', 'Martin', 'paul@ex.fr', null);
INSERT INTO projects (id, agency_id, name) VALUES
 ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Site vitrine');
