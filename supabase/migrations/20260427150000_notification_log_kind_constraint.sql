-- Keep notification log idempotence compatible with every notification kind
-- emitted by src/server/jobs/dispatch_notifications.ts.
ALTER TABLE public.notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_kind_check;

ALTER TABLE public.notification_logs
  ADD CONSTRAINT notification_logs_kind_check
  CHECK (kind IN ('outage_start', 'water_back', 'preventive', 'preventive_water_back'));
