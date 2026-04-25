
-- 1) Normaliser les secteurs vides / "null" en vrais NULL
UPDATE public.outages SET sector = NULL
  WHERE sector IS NOT NULL AND (lower(trim(sector)) IN ('null','none','') OR trim(sector) = '');
UPDATE public.outage_history SET sector = NULL
  WHERE sector IS NOT NULL AND (lower(trim(sector)) IN ('null','none','') OR trim(sector) = '');

-- 2) Dédupliquer outages : même commune + créneau + secteur normalisé
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY commune_id, starts_at, COALESCE(ends_at, starts_at + INTERVAL '180 minutes'),
                        COALESCE(lower(trim(sector)), '')
           ORDER BY
             (CASE WHEN external_id IS NOT NULL THEN 0 ELSE 1 END),
             reliability_score DESC NULLS LAST,
             confidence_score DESC NULLS LAST,
             created_at ASC
         ) AS rn
  FROM public.outages
)
DELETE FROM public.outages o USING ranked r
 WHERE o.id = r.id AND r.rn > 1;

-- 3) Dédupliquer outage_history : même commune + créneau + secteur normalisé
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY commune_id, starts_at, ends_at, COALESCE(lower(trim(sector)), '')
           ORDER BY
             (CASE WHEN external_id IS NOT NULL THEN 0 ELSE 1 END),
             reliability_score DESC NULLS LAST,
             confidence_score DESC NULLS LAST,
             archived_at ASC
         ) AS rn
  FROM public.outage_history
)
DELETE FROM public.outage_history h USING ranked r
 WHERE h.id = r.id AND r.rn > 1;

-- 4) Dédupliquer forecasts (commune + date + window_start déjà unique mais on nettoie au cas où)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY commune_id, forecast_date, window_start
           ORDER BY
             (CASE WHEN basis ILIKE 'Planning officiel SMGEAG%' THEN 0 ELSE 1 END),
             confidence DESC,
             created_at ASC
         ) AS rn
  FROM public.forecasts
)
DELETE FROM public.forecasts f USING ranked r
 WHERE f.id = r.id AND r.rn > 1;

-- 5) Forcer la fin estimée sur les coupures actives sans fin et trop vieilles
UPDATE public.outages
   SET ends_at = starts_at + (COALESCE(estimated_duration_minutes, 180) || ' minutes')::interval,
       updated_at = now()
 WHERE status NOT IN ('resolved','cancelled')
   AND ends_at IS NULL
   AND starts_at < now() - INTERVAL '2 hours';

-- 6) Archiver immédiatement tout ce qui est expiré
SELECT public.archive_expired_outages();
