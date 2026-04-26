-- Embed the cron secret directly inside the helper function since
-- ALTER DATABASE postgres SET ... is not permitted on this platform.
CREATE OR REPLACE FUNCTION public.aquagwada_cron_headers()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Cron-Secret', '69da145bfb67b6191a5a3390e0080cbf4c5bb3d8de65003f5e548c0f3b14ce81'
  );
$$;

-- Restrict execution: only the postgres role / cron jobs need it.
REVOKE ALL ON FUNCTION public.aquagwada_cron_headers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aquagwada_cron_headers() FROM anon, authenticated;