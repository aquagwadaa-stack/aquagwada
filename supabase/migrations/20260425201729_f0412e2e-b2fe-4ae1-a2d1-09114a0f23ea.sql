ALTER TABLE public.outage_history
  ADD CONSTRAINT outage_history_commune_id_fkey
  FOREIGN KEY (commune_id)
  REFERENCES public.communes(id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_outage_history_commune_starts
  ON public.outage_history (commune_id, starts_at DESC);