-- Cohérence projets ↔ clients ↔ étapes (audit du 01/11/2026)
--
-- 1. Un projet « Terminé » repasse « En cours » (ou « En attente ») dès qu'une
--    étape est ajoutée, rouverte ou refusée.
-- 2. Rattacher un projet à une fiche client recopie le nom et l'email du client
--    dans projects.client_name / projects.client_email.
-- 3. Modifier le nom ou l'email d'une fiche client met à jour ses projets.
-- 4. Rattrapage des données existantes (noms / emails divergents, projets
--    orphelins dont l'email correspond à une seule fiche client de l'agence).
--
-- Aucune colonne ni politique RLS n'est modifiée : uniquement des triggers et
-- un rattrapage de données.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_display_name_for_project(
  p_first_name text,
  p_last_name text,
  p_company_name text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    nullif(trim(concat_ws(' ', nullif(trim(p_first_name), ''), nullif(trim(p_last_name), ''))), ''),
    nullif(trim(p_company_name), '')
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. Réouverture automatique d'un projet terminé
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.checklist_items_reopen_completed_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_any_done boolean;
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- L'étape est toujours « faite » : rien à rouvrir.
  IF NEW.completed IS TRUE AND coalesce(NEW.review_status, 'pending') <> 'rejected' THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = NEW.project_id AND p.status = 'completed'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.checklist_items ci
    WHERE ci.project_id = NEW.project_id AND ci.completed IS TRUE
  ) INTO v_any_done;

  UPDATE public.projects
  SET status = CASE WHEN v_any_done THEN 'in_progress' ELSE 'pending' END
  WHERE id = NEW.project_id
    AND status = 'completed';

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS checklist_items_reopen_completed_project_trg ON public.checklist_items;
CREATE TRIGGER checklist_items_reopen_completed_project_trg
  AFTER INSERT OR UPDATE OF completed, review_status ON public.checklist_items
  FOR EACH ROW
  EXECUTE FUNCTION public.checklist_items_reopen_completed_project();

-- ---------------------------------------------------------------------------
-- 2. Projet rattaché à une fiche client → nom / email du client
--    (nom « projects_aa_* » : s'exécute avant trg_projects_default_name et
--    projects_portal_column_guard_trg, les triggers BEFORE étant triés par nom)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.projects_sync_client_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
  v_email text;
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id THEN
    RETURN NEW;
  END IF;

  SELECT
    public.client_display_name_for_project(c.first_name, c.last_name, c.company_name),
    nullif(lower(trim(c.email)), '')
  INTO v_name, v_email
  FROM public.clients c
  WHERE c.id = NEW.client_id
    AND c.agency_id = NEW.agency_id;

  IF v_name IS NOT NULL THEN
    NEW.client_name := v_name;
  END IF;
  IF v_email IS NOT NULL THEN
    NEW.client_email := v_email;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_aa_sync_client_identity_trg ON public.projects;
CREATE TRIGGER projects_aa_sync_client_identity_trg
  BEFORE INSERT OR UPDATE OF client_id ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.projects_sync_client_identity();

-- ---------------------------------------------------------------------------
-- 3. Fiche client modifiée → projets du client
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clients_propagate_identity_to_projects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
  v_old_name text;
  v_email text;
BEGIN
  v_name := public.client_display_name_for_project(NEW.first_name, NEW.last_name, NEW.company_name);
  v_old_name := public.client_display_name_for_project(OLD.first_name, OLD.last_name, OLD.company_name);
  v_email := nullif(lower(trim(NEW.email)), '');

  IF v_name IS NOT NULL AND v_name IS DISTINCT FROM v_old_name THEN
    UPDATE public.projects
    SET client_name = v_name
    WHERE client_id = NEW.id
      AND agency_id = NEW.agency_id
      AND client_name IS DISTINCT FROM v_name;
  END IF;

  IF v_email IS NOT NULL
     AND v_email IS DISTINCT FROM nullif(lower(trim(OLD.email)), '') THEN
    UPDATE public.projects
    SET client_email = v_email
    WHERE client_id = NEW.id
      AND agency_id = NEW.agency_id
      AND client_email IS DISTINCT FROM v_email;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS clients_propagate_identity_to_projects_trg ON public.clients;
CREATE TRIGGER clients_propagate_identity_to_projects_trg
  AFTER UPDATE OF first_name, last_name, company_name, email ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.clients_propagate_identity_to_projects();

REVOKE EXECUTE ON FUNCTION public.checklist_items_reopen_completed_project() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.projects_sync_client_identity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clients_propagate_identity_to_projects() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Rattrapage des données existantes
--    Exécuté avec le rôle service : sinon projects_portal_column_guard (qui
--    protège client_id / client_name / client_email hors session) l'annule.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- 4a. Projets orphelins : rattachement si l'email correspond à UNE seule fiche
--     client de la même agence (le trigger 2 recopie ensuite nom / email).
WITH candidates AS (
  SELECT p.id AS project_id, min(c.id::text)::uuid AS client_id, count(*) AS n
  FROM public.projects p
  JOIN public.clients c
    ON c.agency_id = p.agency_id
   AND nullif(lower(trim(c.email)), '') = lower(trim(p.client_email))
  WHERE p.client_id IS NULL
  GROUP BY p.id
)
UPDATE public.projects p
SET client_id = cand.client_id
FROM candidates cand
WHERE p.id = cand.project_id
  AND cand.n = 1;

-- 4b. Nom / email des projets rattachés alignés sur la fiche client.
UPDATE public.projects p
SET client_name = public.client_display_name_for_project(c.first_name, c.last_name, c.company_name)
FROM public.clients c
WHERE c.id = p.client_id
  AND c.agency_id = p.agency_id
  AND public.client_display_name_for_project(c.first_name, c.last_name, c.company_name) IS NOT NULL
  AND p.client_name IS DISTINCT FROM public.client_display_name_for_project(c.first_name, c.last_name, c.company_name);

UPDATE public.projects p
SET client_email = lower(trim(c.email))
FROM public.clients c
WHERE c.id = p.client_id
  AND c.agency_id = p.agency_id
  AND nullif(lower(trim(c.email)), '') IS NOT NULL
  AND p.client_email IS DISTINCT FROM lower(trim(c.email));

-- 4c. Projets « Terminé » qui ont encore une étape à faire ou refusée.
UPDATE public.projects p
SET status = CASE
  WHEN EXISTS (SELECT 1 FROM public.checklist_items d WHERE d.project_id = p.id AND d.completed IS TRUE)
    THEN 'in_progress'
  ELSE 'pending'
END
WHERE p.status = 'completed'
  AND EXISTS (
    SELECT 1 FROM public.checklist_items ci
    WHERE ci.project_id = p.id
      AND (ci.completed IS NOT TRUE OR coalesce(ci.review_status, 'pending') = 'rejected')
  );
