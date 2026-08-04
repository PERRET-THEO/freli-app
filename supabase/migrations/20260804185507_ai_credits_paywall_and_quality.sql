-- Paywall IA, ledger crédits, qualité extraction, clauses, observabilité, rétention OCR

-- ---------------------------------------------------------------------------
-- Crédits IA
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_credit_balances (
  agency_id UUID PRIMARY KEY REFERENCES agencies(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  period_start DATE NOT NULL DEFAULT (date_trunc('month', now())::date),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'monthly_grant',
    'pack_purchase',
    'consume_extraction',
    'consume_reminder',
    'consume_contract',
    'consume_analyze_model',
    'adjustment'
  )),
  feature TEXT CHECK (feature IS NULL OR feature IN ('extraction', 'reminders', 'contracts')),
  ref_id UUID,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_credit_ledger_agency_created
  ON ai_credit_ledger(agency_id, created_at DESC);

ALTER TABLE ai_credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_credit_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Members read ai credit balances' AND tablename = 'ai_credit_balances'
  ) THEN
    CREATE POLICY "Members read ai credit balances"
    ON ai_credit_balances FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT user_agency_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Members read ai credit ledger' AND tablename = 'ai_credit_ledger'
  ) THEN
    CREATE POLICY "Members read ai credit ledger"
    ON ai_credit_ledger FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT user_agency_ids()));
  END IF;
END $$;

-- Consommation atomique (1 crédit = 1 opération métier). Service role only.
CREATE OR REPLACE FUNCTION public.consume_ai_credit(
  p_agency_id UUID,
  p_reason TEXT,
  p_feature TEXT DEFAULT NULL,
  p_ref_id UUID DEFAULT NULL,
  p_amount INTEGER DEFAULT 1
)
RETURNS TABLE(ok BOOLEAN, balance_after INTEGER, error_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
  v_period DATE := date_trunc('month', now())::date;
  v_addon BOOLEAN;
BEGIN
  IF p_amount IS NULL OR p_amount < 1 THEN
    RETURN QUERY SELECT false, 0, 'invalid_amount';
    RETURN;
  END IF;

  SELECT COALESCE(ba.ai_addon_active, false) INTO v_addon
  FROM billing_accounts ba
  WHERE ba.agency_id = p_agency_id;

  IF v_addon IS DISTINCT FROM true THEN
    RETURN QUERY SELECT false, 0, 'addon_inactive';
    RETURN;
  END IF;

  INSERT INTO ai_credit_balances (agency_id, balance, period_start, updated_at)
  VALUES (p_agency_id, 0, v_period, now())
  ON CONFLICT (agency_id) DO NOTHING;

  SELECT b.balance INTO v_balance
  FROM ai_credit_balances b
  WHERE b.agency_id = p_agency_id
  FOR UPDATE;

  -- Reset mensuel paresseux si nouvelle période
  IF (SELECT period_start FROM ai_credit_balances WHERE agency_id = p_agency_id) < v_period THEN
    UPDATE ai_credit_balances
    SET balance = 50, period_start = v_period, updated_at = now()
    WHERE agency_id = p_agency_id;
    INSERT INTO ai_credit_ledger (agency_id, delta, reason, feature, ref_id, balance_after)
    VALUES (p_agency_id, 50, 'monthly_grant', NULL, NULL, 50);
    v_balance := 50;
  END IF;

  IF v_balance < p_amount THEN
    RETURN QUERY SELECT false, v_balance, 'insufficient_credits';
    RETURN;
  END IF;

  v_balance := v_balance - p_amount;
  UPDATE ai_credit_balances
  SET balance = v_balance, updated_at = now()
  WHERE agency_id = p_agency_id;

  INSERT INTO ai_credit_ledger (agency_id, delta, reason, feature, ref_id, balance_after)
  VALUES (p_agency_id, -p_amount, p_reason, p_feature, p_ref_id, v_balance);

  RETURN QUERY SELECT true, v_balance, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_credit(UUID, TEXT, TEXT, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_ai_credit(UUID, TEXT, TEXT, UUID, INTEGER) TO service_role;

-- Attribution / reset des crédits mensuels (appelé au sync billing)
CREATE OR REPLACE FUNCTION public.ensure_ai_monthly_credits(p_agency_id UUID, p_credits INTEGER DEFAULT 50)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period DATE := date_trunc('month', now())::date;
  v_balance INTEGER;
  v_period_start DATE;
BEGIN
  INSERT INTO ai_credit_balances (agency_id, balance, period_start, updated_at)
  VALUES (p_agency_id, p_credits, v_period, now())
  ON CONFLICT (agency_id) DO NOTHING;

  SELECT balance, period_start INTO v_balance, v_period_start
  FROM ai_credit_balances
  WHERE agency_id = p_agency_id
  FOR UPDATE;

  IF v_period_start < v_period THEN
    UPDATE ai_credit_balances
    SET balance = p_credits, period_start = v_period, updated_at = now()
    WHERE agency_id = p_agency_id;
    INSERT INTO ai_credit_ledger (agency_id, delta, reason, feature, ref_id, balance_after)
    VALUES (p_agency_id, p_credits, 'monthly_grant', NULL, NULL, p_credits);
    RETURN p_credits;
  END IF;

  -- Première activation (solde 0, période courante) → grant
  IF v_balance = 0 AND NOT EXISTS (
    SELECT 1 FROM ai_credit_ledger WHERE agency_id = p_agency_id AND reason = 'monthly_grant'
      AND created_at >= v_period::timestamptz
  ) THEN
    UPDATE ai_credit_balances
    SET balance = p_credits, updated_at = now()
    WHERE agency_id = p_agency_id;
    INSERT INTO ai_credit_ledger (agency_id, delta, reason, feature, ref_id, balance_after)
    VALUES (p_agency_id, p_credits, 'monthly_grant', NULL, NULL, p_credits);
    RETURN p_credits;
  END IF;

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_ai_monthly_credits(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_ai_monthly_credits(UUID, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- Usage logs : coût estimé + RLS membres
-- ---------------------------------------------------------------------------

ALTER TABLE ai_usage_logs
  ADD COLUMN IF NOT EXISTS estimated_cost_cents NUMERIC(10, 4),
  ADD COLUMN IF NOT EXISTS prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS credits_consumed INTEGER DEFAULT 0;

DROP POLICY IF EXISTS "Agency reads own ai usage logs" ON ai_usage_logs;
CREATE POLICY "Members read ai usage logs"
  ON ai_usage_logs FOR SELECT
  TO authenticated
  USING (agency_id IN (SELECT user_agency_ids()));

-- ---------------------------------------------------------------------------
-- Extraction : confidence + prompt version + rétention OCR
-- ---------------------------------------------------------------------------

ALTER TABLE extracted_document_data
  ADD COLUMN IF NOT EXISTS field_confidence JSONB,
  ADD COLUMN IF NOT EXISTS prompt_version TEXT;

COMMENT ON COLUMN extracted_document_data.ocr_markdown IS
  'Texte OCR temporaire. Effacé après validation/rejet humaine (rétention minimale RGPD). TTL opérationnel : jusqu''à HITL puis purge.';

CREATE OR REPLACE FUNCTION public.clear_extraction_ocr_on_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('validated', 'rejected') AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.ocr_markdown := NULL;
    NEW.ocr_pages := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_extraction_ocr_on_review ON extracted_document_data;
CREATE TRIGGER trg_clear_extraction_ocr_on_review
  BEFORE UPDATE ON extracted_document_data
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_extraction_ocr_on_review();

-- ---------------------------------------------------------------------------
-- Relances : plage horaire d'envoi (heures locales Europe/Paris)
-- ---------------------------------------------------------------------------

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS ai_reminder_send_hour_start SMALLINT NOT NULL DEFAULT 9
    CHECK (ai_reminder_send_hour_start >= 0 AND ai_reminder_send_hour_start <= 23),
  ADD COLUMN IF NOT EXISTS ai_reminder_send_hour_end SMALLINT NOT NULL DEFAULT 19
    CHECK (ai_reminder_send_hour_end >= 1 AND ai_reminder_send_hour_end <= 24);

COMMENT ON COLUMN agencies.ai_reminder_send_hour_start IS
  'Heure locale (Europe/Paris) à partir de laquelle le batch peut générer/envoyer des relances IA.';
COMMENT ON COLUMN agencies.ai_reminder_send_hour_end IS
  'Heure locale exclusive (Europe/Paris) de fin de plage d''envoi des relances IA.';

-- ---------------------------------------------------------------------------
-- Bibliothèque de clauses (origine library)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_clause_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN (
      'general', 'payment', 'ip', 'confidentiality', 'termination', 'liability', 'other'
    )),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_clause_library_agency_active
  ON ai_clause_library(agency_id, is_active);

ALTER TABLE ai_clause_library ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Members manage clause library' AND tablename = 'ai_clause_library'
  ) THEN
    CREATE POLICY "Members manage clause library"
    ON ai_clause_library FOR ALL
    TO authenticated
    USING (agency_id IN (SELECT user_agency_ids()))
    WITH CHECK (agency_id IN (SELECT user_agency_ids()));
  END IF;
END $$;
