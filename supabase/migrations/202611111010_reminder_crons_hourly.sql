-- Crons horaires des relances automatiques (pg_cron + pg_net).
-- L'ancien job « send-reminders-every-hour » échouait à chaque passage
-- (JSON invalide : app.settings.service_role_key absent) → seules les passes
-- GitHub (2-3 / jour, souvent en retard) déclenchaient les relances.
-- Authentification via app_internal_secrets.cron_shared (comme expire-stale-checkouts).
--
--   :05  smart-reminders-batch  (agences IA : IA prioritaire + repli classique)
--   :35  send-reminders-batch   (agences sans IA + filet de sécurité 24 h)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-reminders-every-hour') THEN
    PERFORM cron.unschedule('send-reminders-every-hour');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'smart-reminders-hourly') THEN
    PERFORM cron.unschedule('smart-reminders-hourly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'classic-reminders-hourly') THEN
    PERFORM cron.unschedule('classic-reminders-hourly');
  END IF;
END $$;

SELECT cron.schedule(
  'smart-reminders-hourly',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xxghfeshnihagvahmmpr.supabase.co/functions/v1/smart-reminders-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        SELECT value FROM public.app_internal_secrets WHERE key = 'cron_shared' LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

SELECT cron.schedule(
  'classic-reminders-hourly',
  '35 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xxghfeshnihagvahmmpr.supabase.co/functions/v1/send-reminders-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        SELECT value FROM public.app_internal_secrets WHERE key = 'cron_shared' LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
