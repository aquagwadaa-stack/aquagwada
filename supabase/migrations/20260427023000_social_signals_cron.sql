-- Add a low-confidence social signal scraper for public Facebook/web mentions.
-- This enriches current unplanned outages and historical context without treating social posts as official SMGEAG truth.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aquagwada-scrape-social-signals') THEN
    PERFORM cron.unschedule('aquagwada-scrape-social-signals');
  END IF;
END $$;

SELECT cron.schedule(
  'aquagwada-scrape-social-signals',
  '*/20 * * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/scrape-social-signals',
    headers := public.aquagwada_cron_headers(),
    body := '{}'::jsonb
  ); $$
);
