-- Facture automatique au paiement Stripe d'un projet, côté base.
--
-- Le webhook Stripe (rôle service) passe projects.payment_status à « paid » en
-- vidant stripe_checkout_session_id : OLD.stripe_checkout_session_id sert donc de
-- référence de paiement, et le prix (vérifié par le webhook = montant payé) de montant.
-- Aucune modification du webhook n'est nécessaire.
-- Toute erreur est absorbée : le passage en « payé » n'est jamais bloqué.

CREATE OR REPLACE FUNCTION public.projects_invoice_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NEW.payment_status IS DISTINCT FROM 'paid'
     OR OLD.payment_status IS NOT DISTINCT FROM 'paid'
     OR coalesce(auth.role(), '') <> 'service_role'
     OR NEW.price IS NULL OR NEW.price <= 0 THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_result := public.create_invoice_for_project_payment(
      NEW.id,
      OLD.stripe_checkout_session_id,
      NEW.price
    );
    RAISE LOG 'invoice_on_paid project=% result=%', NEW.id, v_result;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'invoice_on_paid project=% failed: %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.projects_invoice_on_paid() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS projects_invoice_on_paid_trg ON public.projects;
CREATE TRIGGER projects_invoice_on_paid_trg
  AFTER UPDATE OF payment_status ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.projects_invoice_on_paid();
