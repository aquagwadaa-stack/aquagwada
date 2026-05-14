-- Keep official planning fresh enough for same-day preventive alerts.
-- Old schedule ran only at 06:00, 12:00 and 18:00 UTC; if SMGEAG posted
-- or changed a planning after 14:00 Guadeloupe, AquaGwada could miss evening alerts.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aquagwada-scrape-planning') THEN
    PERFORM cron.unschedule('aquagwada-scrape-planning');
  END IF;
END $$;

SELECT cron.schedule(
  'aquagwada-scrape-planning',
  '0 */4 * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/scrape-planning',
    headers := public.aquagwada_cron_headers(),
    body := '{}'::jsonb
  ); $$
);
