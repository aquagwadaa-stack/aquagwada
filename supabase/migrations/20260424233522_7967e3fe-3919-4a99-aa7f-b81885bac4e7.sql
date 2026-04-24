-- Unschedule any existing jobs to avoid duplicates
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobname FROM cron.job WHERE jobname IN (
    'aquagwada-scrape-smgeag',
    'aquagwada-process-reports',
    'aquagwada-generate-forecasts',
    'aquagwada-dispatch-notifications',
    'aquagwada-check-preventive',
    'aquagwada-cleanup-history'
  )
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

-- Scrape SMGEAG toutes les 30 minutes
SELECT cron.schedule(
  'aquagwada-scrape-smgeag',
  '*/30 * * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.lovable.app/api/public/jobs/scrape-smgeag',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

-- Traitement des signalements toutes les 5 minutes
SELECT cron.schedule(
  'aquagwada-process-reports',
  '*/5 * * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.lovable.app/api/public/jobs/process-reports',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

-- Génération des prévisions toutes les 6 heures
SELECT cron.schedule(
  'aquagwada-generate-forecasts',
  '0 */6 * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.lovable.app/api/public/jobs/generate-forecasts',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

-- Dispatch des notifications toutes les 2 minutes
SELECT cron.schedule(
  'aquagwada-dispatch-notifications',
  '*/2 * * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.lovable.app/api/public/jobs/dispatch-notifications',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

-- Vérification préventive toutes les heures
SELECT cron.schedule(
  'aquagwada-check-preventive',
  '0 * * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.lovable.app/api/public/jobs/check-preventive',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

-- Nettoyage de l'historique tous les jours à 3h
SELECT cron.schedule(
  'aquagwada-cleanup-history',
  '0 3 * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.lovable.app/api/public/jobs/cleanup-history',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);