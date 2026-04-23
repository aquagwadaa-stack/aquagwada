
-- ============================================================
-- 1. OUTAGES : champs de précision + index
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.time_precision AS ENUM ('exact', 'approximate', 'day_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.outages
  ADD COLUMN IF NOT EXISTS time_precision public.time_precision NOT NULL DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS is_estimated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confidence_score numeric(3,2) NOT NULL DEFAULT 0.80,
  ADD COLUMN IF NOT EXISTS confidence_source_weight numeric(3,2) NOT NULL DEFAULT 1.00;

-- Index perf
CREATE INDEX IF NOT EXISTS idx_outages_commune_starts ON public.outages (commune_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_outages_status_starts ON public.outages (status, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_outages_starts ON public.outages (starts_at DESC);

-- Unicité (source, external_id) — évite doublons à l'ingestion
DO $$ BEGIN
  ALTER TABLE public.outages
    ADD CONSTRAINT outages_source_external_unique UNIQUE (source, external_id);
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN duplicate_table THEN NULL; END $$;

-- ============================================================
-- 2. OUTAGE_HISTORY : archive long terme
-- ============================================================
CREATE TABLE IF NOT EXISTS public.outage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_outage_id uuid,
  commune_id uuid NOT NULL,
  sector text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  cause text,
  description text,
  source public.outage_source NOT NULL,
  source_url text,
  external_id text,
  reliability_score numeric(3,2) NOT NULL DEFAULT 0.50,
  confidence_score numeric(3,2) NOT NULL DEFAULT 0.80,
  time_precision public.time_precision NOT NULL DEFAULT 'exact',
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_history_commune_starts ON public.outage_history (commune_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_starts ON public.outage_history (starts_at DESC);

ALTER TABLE public.outage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS history_read_all ON public.outage_history;
CREATE POLICY history_read_all ON public.outage_history FOR SELECT USING (true);

DROP POLICY IF EXISTS history_write_mod ON public.outage_history;
CREATE POLICY history_write_mod ON public.outage_history FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- ============================================================
-- 3. FORECASTS : confidence + fenêtre timestamp
-- ============================================================
ALTER TABLE public.forecasts
  ADD COLUMN IF NOT EXISTS confidence numeric(3,2) NOT NULL DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS expected_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS sample_size integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_forecasts_commune_date ON public.forecasts (commune_id, forecast_date);
CREATE INDEX IF NOT EXISTS idx_forecasts_date ON public.forecasts (forecast_date);

-- Unicité (commune, date, fenêtre) — éviter doublons de prévisions
DO $$ BEGIN
  ALTER TABLE public.forecasts
    ADD CONSTRAINT forecasts_commune_date_window_unique
    UNIQUE (commune_id, forecast_date, window_start);
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN duplicate_table THEN NULL; END $$;

-- ============================================================
-- 4. ARCHIVAGE AUTO : trigger move resolved → history
-- ============================================================
CREATE OR REPLACE FUNCTION public.archive_resolved_outages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  duration_min integer;
BEGIN
  IF (NEW.status IN ('resolved', 'cancelled'))
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.ends_at IS NOT NULL THEN
    duration_min := GREATEST(1, EXTRACT(EPOCH FROM (NEW.ends_at - NEW.starts_at))::int / 60);

    INSERT INTO public.outage_history (
      original_outage_id, commune_id, sector, starts_at, ends_at,
      duration_minutes, cause, description, source, source_url,
      external_id, reliability_score, confidence_score, time_precision
    ) VALUES (
      NEW.id, NEW.commune_id, NEW.sector, NEW.starts_at, NEW.ends_at,
      duration_min, NEW.cause, NEW.description, NEW.source, NEW.source_url,
      NEW.external_id, NEW.reliability_score, NEW.confidence_score, NEW.time_precision
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_resolved_outages ON public.outages;
CREATE TRIGGER trg_archive_resolved_outages
AFTER UPDATE ON public.outages
FOR EACH ROW EXECUTE FUNCTION public.archive_resolved_outages();

-- ============================================================
-- 5. ENFORCE LIMITE MULTI-COMMUNES selon plan
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_user_communes_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_tier subscription_tier;
  plan_max integer;
  current_count integer;
BEGIN
  SELECT tier INTO user_tier FROM public.subscriptions
  WHERE user_id = NEW.user_id AND status IN ('active','trialing')
  ORDER BY created_at DESC LIMIT 1;

  IF user_tier IS NULL THEN user_tier := 'free'; END IF;

  SELECT max_communes INTO plan_max FROM public.subscription_plans
  WHERE tier = user_tier ORDER BY sort_order LIMIT 1;

  IF plan_max IS NULL THEN plan_max := 1; END IF;

  SELECT COUNT(*) INTO current_count FROM public.user_communes WHERE user_id = NEW.user_id;

  IF current_count >= plan_max THEN
    RAISE EXCEPTION 'Limite de % commune(s) atteinte pour votre plan (%). Passez à un plan supérieur.', plan_max, user_tier;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_user_communes_limit ON public.user_communes;
CREATE TRIGGER trg_enforce_user_communes_limit
BEFORE INSERT ON public.user_communes
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_communes_limit();

-- ============================================================
-- 6. STATUT GLOBAL PAR COMMUNE
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_commune_status(_commune_id uuid)
RETURNS TABLE (
  status text,
  next_cut timestamptz,
  water_back_at timestamptz,
  ongoing_count integer,
  confidence numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_ts timestamptz := now();
  ongoing_n integer;
  next_outage record;
BEGIN
  SELECT COUNT(*) INTO ongoing_n
  FROM public.outages o
  WHERE o.commune_id = _commune_id
    AND o.starts_at <= now_ts
    AND (o.ends_at IS NULL OR o.ends_at >= now_ts)
    AND o.status NOT IN ('resolved','cancelled');

  IF ongoing_n > 0 THEN
    SELECT MAX(COALESCE(o.ends_at, o.starts_at + (COALESCE(o.estimated_duration_minutes,120) || ' minutes')::interval)) AS back,
           AVG(o.confidence_score)::numeric AS conf
    INTO next_outage
    FROM public.outages o
    WHERE o.commune_id = _commune_id
      AND o.starts_at <= now_ts
      AND (o.ends_at IS NULL OR o.ends_at >= now_ts)
      AND o.status NOT IN ('resolved','cancelled');

    RETURN QUERY SELECT 'outage'::text, NULL::timestamptz, next_outage.back, ongoing_n, COALESCE(next_outage.conf, 0.5);
    RETURN;
  END IF;

  SELECT o.starts_at, o.confidence_score INTO next_outage
  FROM public.outages o
  WHERE o.commune_id = _commune_id
    AND o.starts_at > now_ts
    AND o.status = 'scheduled'
  ORDER BY o.starts_at ASC LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT 'ok'::text, next_outage.starts_at, NULL::timestamptz, 0, COALESCE(next_outage.confidence_score, 0.7);
  ELSE
    RETURN QUERY SELECT 'ok'::text, NULL::timestamptz, NULL::timestamptz, 0, 0.9::numeric;
  END IF;
END;
$$;
