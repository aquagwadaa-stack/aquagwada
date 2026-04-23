-- 1. reports.processed_at + index
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_reports_unprocessed
  ON public.reports (commune_id, created_at)
  WHERE processed_at IS NULL;

-- 2. notification_logs (idempotence)
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  outage_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  kind text NOT NULL CHECK (kind IN ('outage_start','water_back','preventive')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  dry_run boolean NOT NULL DEFAULT true,
  payload jsonb,
  CONSTRAINT notification_logs_unique UNIQUE (user_id, outage_id, kind, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_user_sent
  ON public.notification_logs (user_id, sent_at DESC);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_logs_select_own ON public.notification_logs;
CREATE POLICY notif_logs_select_own
  ON public.notification_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notif_logs_admin_all ON public.notification_logs;
CREATE POLICY notif_logs_admin_all
  ON public.notification_logs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));