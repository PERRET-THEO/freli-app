-- Phase 1: format check that does NOT validate existing rows.
-- Existing invalid emails (e.g. missing TLD) must be cleaned before VALIDATE CONSTRAINT.
-- See scripts/audit_clients_email.sql and migration clients_email_validate_and_unique.

ALTER TABLE public.clients
  ADD CONSTRAINT clients_email_format_check
  CHECK (
    email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
    AND char_length(email) <= 254
  ) NOT VALID;
