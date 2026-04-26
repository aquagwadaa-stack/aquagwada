-- Launch readiness fixes:
-- - push notifications must be accepted by the notification log constraint
-- - email is not exposed as an active channel until an email provider is connected
-- - public plan features must match the currently implemented product

ALTER TABLE public.notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_channel_check;

ALTER TABLE public.notification_logs
  ADD CONSTRAINT notification_logs_channel_check
  CHECK (channel IN ('email', 'sms', 'whatsapp', 'push'));

ALTER TABLE public.notification_preferences
  ALTER COLUMN email_enabled SET DEFAULT false;

UPDATE public.notification_preferences
SET email_enabled = false,
    updated_at = now()
WHERE email_enabled = true;

GRANT EXECUTE ON FUNCTION public.expire_overdue_trials() TO service_role;

UPDATE public.subscription_plans
SET features = '["1 commune suivie", "Notifications push (PWA) en temps reel", "Carte temps reel", "Historique 7 jours", "Signalements communautaires"]'::jsonb
WHERE tier = 'free';

UPDATE public.subscription_plans
SET history_days = 365,
    features = '["5 communes suivies", "Notifications push (PWA) illimitees", "Notifications preventives (jusqu''a 48h avant)", "Previsions a 14 jours", "Historique 1 an", "Essai gratuit 7 jours sans carte"]'::jsonb
WHERE tier = 'pro';

UPDATE public.subscription_plans
SET history_days = 1095,
    features = '["Communes illimitees", "Tout le plan Pro", "Alertes SMS / WhatsApp sur devis", "Acces API B2B", "Historique 3 ans", "Support prioritaire"]'::jsonb
WHERE tier = 'business';
