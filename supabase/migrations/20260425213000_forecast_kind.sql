ALTER TABLE public.forecasts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'statistical_forecast';

ALTER TABLE public.forecasts
  DROP CONSTRAINT IF EXISTS forecasts_kind_check;

ALTER TABLE public.forecasts
  ADD CONSTRAINT forecasts_kind_check
  CHECK (kind IN ('official_schedule', 'statistical_forecast'));

UPDATE public.forecasts
   SET kind = 'official_schedule'
 WHERE basis ILIKE 'Planning officiel SMGEAG%';

UPDATE public.forecasts
   SET kind = 'statistical_forecast'
 WHERE kind IS NULL;

CREATE INDEX IF NOT EXISTS idx_forecasts_kind_date
  ON public.forecasts (kind, forecast_date);

CREATE OR REPLACE FUNCTION public.set_forecast_kind_from_basis()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.basis ILIKE 'Planning officiel SMGEAG%' THEN
    NEW.kind := 'official_schedule';
  ELSIF NEW.kind IS NULL THEN
    NEW.kind := 'statistical_forecast';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_forecast_kind_from_basis_trigger ON public.forecasts;
CREATE TRIGGER set_forecast_kind_from_basis_trigger
BEFORE INSERT OR UPDATE OF basis, kind ON public.forecasts
FOR EACH ROW
EXECUTE FUNCTION public.set_forecast_kind_from_basis();
