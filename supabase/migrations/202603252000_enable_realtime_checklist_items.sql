-- Realtime (Postgres Changes) for /p/:token — supabase_realtime must include this table.
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_items;
