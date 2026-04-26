-- Reinstall HTTP cron schedules after the cron-secret helper was replaced.
-- This file intentionally does not contain the secret; it reuses aquagwada_cron_headers().

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  r record;
  role_name text;
  header_secret text;
BEGIN
  header_secret := public.aquagwada_cron_headers()->>'X-Cron-Secret';
  IF header_secret IS NULL OR length(header_secret) < 32 THEN
    RAISE EXCEPTION 'aquagwada_cron_headers() is missing a usable X-Cron-Secret';
  END IF;

  REVOKE ALL ON FUNCTION public.aquagwada_cron_headers() FROM PUBLIC;

  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.aquagwada_cron_headers() FROM %I', role_name);
    END IF;
  END LOOP;

  FOREACH role_name IN ARRAY ARRAY[current_user, 'postgres', 'supabase_admin', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.aquagwada_cron_headers() TO %I', role_name);
    END IF;
  END LOOP;

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
