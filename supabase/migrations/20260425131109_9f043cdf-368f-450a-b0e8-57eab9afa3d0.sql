-- Ensure the trigger that archives resolved outages is actually present
DROP TRIGGER IF EXISTS archive_resolved_outages_trigger ON public.outages;
CREATE TRIGGER archive_resolved_outages_trigger
AFTER UPDATE ON public.outages
FOR EACH ROW
EXECUTE FUNCTION public.archive_resolved_outages();

DROP TRIGGER IF EXISTS set_outages_updated_at ON public.outages;
CREATE TRIGGER set_outages_updated_at
BEFORE UPDATE ON public.outages
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Archive active/scheduled outages once their known or estimated end has passed.
CREATE OR REPLACE FUNCTION public.archive_expired_outages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  WITH expired AS (
    SELECT o.*,
           COALESCE(
             o.ends_at,
             o.starts_at + (COALESCE(o.estimated_duration_minutes, 180) || ' minutes')::interval
           ) AS effective_end
    FROM public.outages o
    WHERE o.status NOT IN ('resolved','cancelled')
      AND COALESCE(
            o.ends_at,
            o.starts_at + (COALESCE(o.estimated_duration_minutes, 180) || ' minutes')::interval
          ) < now()
  ), archived AS (
    INSERT INTO public.outage_history (
      original_outage_id, commune_id, sector, starts_at, ends_at,
      duration_minutes, cause, description, source, source_url,
      external_id, reliability_score, confidence_score, time_precision
    )
    SELECT
      e.id, e.commune_id, e.sector, e.starts_at, e.effective_end,
      GREATEST(1, EXTRACT(EPOCH FROM (e.effective_end - e.starts_at))::int / 60),
      e.cause, e.description, e.source, e.source_url,
      e.external_id, e.reliability_score, e.confidence_score, e.time_precision
    FROM expired e
    ON CONFLICT (external_id) DO UPDATE SET
      ends_at = EXCLUDED.ends_at,
      duration_minutes = EXCLUDED.duration_minutes,
      description = COALESCE(EXCLUDED.description, public.outage_history.description),
      source_url = COALESCE(EXCLUDED.source_url, public.outage_history.source_url),
      reliability_score = GREATEST(public.outage_history.reliability_score, EXCLUDED.reliability_score),
      confidence_score = GREATEST(public.outage_history.confidence_score, EXCLUDED.confidence_score)
    RETURNING original_outage_id
  ), upd AS (
    UPDATE public.outages o
    SET status = 'resolved',
        ends_at = COALESCE(o.ends_at, o.starts_at + (COALESCE(o.estimated_duration_minutes, 180) || ' minutes')::interval),
        updated_at = now()
    FROM archived a
    WHERE o.id = a.original_outage_id
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;

  RETURN COALESCE(n, 0);
END;
$$;

-- Run once immediately so stale rows stop appearing as active.
SELECT public.archive_expired_outages();

-- Keep automatic jobs aligned with the routes that populate official data.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobname FROM cron.job WHERE jobname IN (
    'aquagwada-scrape-smgeag',
    'aquagwada-scrape-planning',
    'aquagwada-backfill-planning',
    'aquagwada-scrape-ai-history',
    'aquagwada-generate-forecasts',
    'aquagwada-archive-expired-outages'
  )
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

-- Direct database-side cleanup every 10 minutes, independent of the website worker.
SELECT cron.schedule(
  'aquagwada-archive-expired-outages',
  '*/10 * * * *',
  $$ SELECT public.archive_expired_outages(); $$
);

-- Live SMGEAG scraping every 30 minutes.
SELECT cron.schedule(
  'aquagwada-scrape-smgeag',
  '*/30 * * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/scrape-smgeag',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

-- Official weekly planning import three times a day.
SELECT cron.schedule(
  'aquagwada-scrape-planning',
  '0 6,12,18 * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/scrape-planning',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

-- Historical planning backfill daily until the October 2025+ backlog is fully present.
SELECT cron.schedule(
  'aquagwada-backfill-planning',
  '30 2 * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/backfill-planning',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"since":"2025-10-01","maxPosts":80}'::jsonb
  ); $$
);

-- AI history as a secondary source, weekly.
SELECT cron.schedule(
  'aquagwada-scrape-ai-history',
  '0 4 * * 0',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/scrape-ai-history',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

-- Statistical forecasts after official imports.
SELECT cron.schedule(
  'aquagwada-generate-forecasts',
  '15 */6 * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/generate-forecasts',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);