-- Secure HTTP cron calls after protecting /api/public/jobs/*.
-- Before enabling these schedules in production, set the same value in:
--   1. the app/server environment variable CRON_SECRET
--   2. the database setting app.settings.cron_secret
--
-- Example:
--   ALTER DATABASE postgres SET app.settings.cron_secret = 'replace-with-a-long-random-secret';

CREATE OR REPLACE FUNCTION public.aquagwada_cron_headers()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Cron-Secret', COALESCE(current_setting('app.settings.cron_secret', true), '')
  );
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobname FROM cron.job WHERE jobname IN (
    'aquagwada-scrape-smgeag',
    'aquagwada-process-reports',
    'aquagwada-generate-forecasts',
    'aquagwada-dispatch-notifications',
    'aquagwada-check-preventive',
    'aquagwada-cleanup-history',
    'aquagwada-scrape-planning',
    'aquagwada-backfill-planning',
    'aquagwada-scrape-ai-history',
    'aquagwada-archive-expired-outages'
  )
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

SELECT cron.schedule(
  'aquagwada-archive-expired-outages',
  '*/10 * * * *',
  $$ SELECT public.archive_expired_outages(); $$
);

SELECT cron.schedule(
  'aquagwada-scrape-smgeag',
  '*/30 * * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/scrape-smgeag',
    headers := public.aquagwada_cron_headers(),
    body := '{}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'aquagwada-process-reports',
  '*/5 * * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/process-reports',
    headers := public.aquagwada_cron_headers(),
    body := '{}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'aquagwada-dispatch-notifications',
  '*/2 * * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/dispatch-notifications',
    headers := public.aquagwada_cron_headers(),
    body := '{}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'aquagwada-check-preventive',
  '0 * * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/check-preventive',
    headers := public.aquagwada_cron_headers(),
    body := '{}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'aquagwada-cleanup-history',
  '0 3 * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/cleanup-history',
    headers := public.aquagwada_cron_headers(),
    body := '{}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'aquagwada-scrape-planning',
  '0 6,12,18 * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/scrape-planning',
    headers := public.aquagwada_cron_headers(),
    body := '{}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'aquagwada-backfill-planning',
  '30 2 * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/backfill-planning',
    headers := public.aquagwada_cron_headers(),
    body := '{"since":"2025-10-01","maxPosts":80}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'aquagwada-scrape-ai-history',
  '0 4 * * 0',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/scrape-ai-history',
    headers := public.aquagwada_cron_headers(),
    body := '{}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'aquagwada-generate-forecasts',
  '15 */6 * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/generate-forecasts',
    headers := public.aquagwada_cron_headers(),
    body := '{}'::jsonb
  ); $$
);
