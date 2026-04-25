CREATE OR REPLACE FUNCTION public.cleanup_outage_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  normalized_outages integer := 0;
  normalized_history integer := 0;
  deduped_outages integer := 0;
  deduped_history integer := 0;
  deduped_forecasts integer := 0;
BEGIN
  UPDATE public.outages
     SET sector = NULL,
         updated_at = now()
   WHERE sector IS NOT NULL
     AND lower(trim(sector)) IN ('', 'null', 'undefined', 'none', 'n/a');
  GET DIAGNOSTICS normalized_outages = ROW_COUNT;

  UPDATE public.outage_history
     SET sector = NULL
   WHERE sector IS NOT NULL
     AND lower(trim(sector)) IN ('', 'null', 'undefined', 'none', 'n/a');
  GET DIAGNOSTICS normalized_history = ROW_COUNT;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY commune_id,
                          starts_at,
                          COALESCE(ends_at, starts_at + INTERVAL '180 minutes'),
                          COALESCE(lower(trim(sector)), ''),
                          source
             ORDER BY
               reliability_score DESC NULLS LAST,
               confidence_score DESC NULLS LAST,
               created_at ASC
           ) AS rn
      FROM public.outages
  )
  DELETE FROM public.outages o USING ranked r
   WHERE o.id = r.id
     AND r.rn > 1;
  GET DIAGNOSTICS deduped_outages = ROW_COUNT;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY commune_id,
                          starts_at,
                          ends_at,
                          COALESCE(lower(trim(sector)), ''),
                          source
             ORDER BY
               reliability_score DESC NULLS LAST,
               confidence_score DESC NULLS LAST,
               archived_at ASC
           ) AS rn
      FROM public.outage_history
  )
  DELETE FROM public.outage_history h USING ranked r
   WHERE h.id = r.id
     AND r.rn > 1;
  GET DIAGNOSTICS deduped_history = ROW_COUNT;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY commune_id, forecast_date, window_start, COALESCE(kind, 'statistical_forecast')
             ORDER BY
               CASE WHEN kind = 'official_schedule' THEN 0 ELSE 1 END,
               confidence DESC,
               created_at ASC
           ) AS rn
      FROM public.forecasts
  )
  DELETE FROM public.forecasts f USING ranked r
   WHERE f.id = r.id
     AND r.rn > 1;
  GET DIAGNOSTICS deduped_forecasts = ROW_COUNT;

  RETURN jsonb_build_object(
    'normalized_outages', normalized_outages,
    'normalized_history', normalized_history,
    'deduped_outages', deduped_outages,
    'deduped_history', deduped_history,
    'deduped_forecasts', deduped_forecasts
  );
END;
$$;
