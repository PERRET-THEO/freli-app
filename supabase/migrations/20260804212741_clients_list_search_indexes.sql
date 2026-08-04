-- GIN trigram index for list_clients search (f_unaccent + extensions created in list_clients_rpc).

CREATE INDEX IF NOT EXISTS clients_search_trgm_idx
  ON public.clients
  USING gin (
    (public.f_unaccent(lower(
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(company_name, '')
    )))
    gin_trgm_ops
  );
