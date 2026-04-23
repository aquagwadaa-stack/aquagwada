-- 1. Pro: 10 communes au lieu de 5
UPDATE public.subscription_plans SET max_communes = 10 WHERE tier = 'pro';

-- 2. Tendance dans forecasts
ALTER TABLE public.forecasts
  ADD COLUMN IF NOT EXISTS trend text NOT NULL DEFAULT 'stable'
  CHECK (trend IN ('improving','stable','worsening'));

ALTER TABLE public.forecasts
  ADD COLUMN IF NOT EXISTS day_of_week_signal numeric NOT NULL DEFAULT 0;

-- 3. Index perf
CREATE INDEX IF NOT EXISTS idx_outage_history_commune_starts ON public.outage_history (commune_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_outage_history_starts ON public.outage_history (starts_at);
CREATE INDEX IF NOT EXISTS idx_outages_commune_starts ON public.outages (commune_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_outages_status_starts ON public.outages (status, starts_at);