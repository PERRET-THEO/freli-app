-- Audit clients emails before VALIDATE CONSTRAINT / UNIQUE index.
-- Run on staging then prod; fix or merge rows manually. Do not auto-delete.

-- Invalid format (no TLD, spaces, too long)
SELECT id, agency_id, email, created_at
FROM public.clients
WHERE email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
   OR char_length(email) > 254
ORDER BY agency_id, created_at;

-- Duplicates per agency (case-insensitive)
SELECT agency_id, lower(email) AS email_norm, count(*) AS n, array_agg(id ORDER BY created_at) AS ids
FROM public.clients
GROUP BY agency_id, lower(email)
HAVING count(*) > 1
ORDER BY n DESC, agency_id;
