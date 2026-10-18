-- Diagnostic (READ ONLY): duplicate clients per agency by normalized email.
-- Normalization: lower(trim(email)) — aligns with app normalizeClientEmail.
-- Do not delete or merge automatically; fix manually then run validate_clients_email.sql.

SELECT
  agency_id,
  lower(trim(email)) AS email_norm,
  count(*) AS n,
  array_agg(id ORDER BY created_at) AS ids,
  array_agg(email ORDER BY created_at) AS emails_raw,
  array_agg(trim(both FROM first_name || ' ' || last_name) ORDER BY created_at) AS names,
  array_agg(company_name ORDER BY created_at) AS companies
FROM public.clients
GROUP BY agency_id, lower(trim(email))
HAVING count(*) > 1
ORDER BY n DESC, agency_id;
