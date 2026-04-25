DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'outage_history_external_unique'
      AND conrelid = 'public.outage_history'::regclass
  ) THEN
    ALTER TABLE public.outage_history
      ADD CONSTRAINT outage_history_external_unique UNIQUE (external_id);
  END IF;
END $$;

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