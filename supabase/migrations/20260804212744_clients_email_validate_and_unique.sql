-- Phase 3 is intentionally a no-op in the automatic migration chain.
-- Invalid emails / duplicates already exist in some databases; VALIDATE would fail deploy.
--
-- After scripts/audit_clients_email.sql returns zero rows on the target DB, run:
--   scripts/validate_clients_email.sql
--
-- Do not uncomment VALIDATE here until the audit is green in every environment
-- that applies this migration.

SELECT 1;
