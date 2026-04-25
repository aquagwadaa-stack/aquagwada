DROP TRIGGER IF EXISTS trg_outages_updated ON public.outages;
CREATE TRIGGER trg_outages_updated
BEFORE UPDATE ON public.outages
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_archive_resolved_outages ON public.outages;
CREATE TRIGGER trg_archive_resolved_outages
AFTER UPDATE ON public.outages
FOR EACH ROW
EXECUTE FUNCTION public.archive_resolved_outages();