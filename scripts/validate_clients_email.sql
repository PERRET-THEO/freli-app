-- Run ONLY after scripts/audit_clients_email.sql is clean on this database.

ALTER TABLE public.clients
  VALIDATE CONSTRAINT clients_email_format_check;

CREATE UNIQUE INDEX IF NOT EXISTS clients_agency_email_unique
  ON public.clients (agency_id, lower(email));
