-- Billing/email readiness:
-- - store processed Stripe event ids to avoid duplicate transactional emails
-- - store trial reminder emails already sent
-- - schedule the protected trial email job
-- - expose email as an implemented channel now that Resend is wired server-side

CREATE TABLE IF NOT EXISTS public.stripe_event_logs (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trial_email_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('trial_ending', 'trial_ended')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind)
);

ALTER TABLE public.notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_channel_check;

ALTER TABLE public.notification_logs
  ADD CONSTRAINT notification_logs_channel_check
  CHECK (channel IN ('email', 'sms', 'whatsapp', 'push'));

ALTER TABLE public.notification_preferences
  ALTER COLUMN email_enabled SET DEFAULT false;

UPDATE public.subscription_plans
SET features = '["1 commune suivie", "Notifications push (PWA) en temps reel", "Alertes email disponibles", "Carte temps reel", "Historique 7 jours", "Signalements communautaires"]'::jsonb
WHERE tier = 'free';

UPDATE public.subscription_plans
SET history_days = 365,
    features = '["5 communes suivies", "Notifications push (PWA) illimitees", "Alertes email", "Notifications preventives (jusqu''a 48h avant)", "Previsions a 14 jours", "Historique 1 an", "Essai gratuit 7 jours sans carte"]'::jsonb
WHERE tier = 'pro';

UPDATE public.subscription_plans
SET history_days = 1095,
    features = '["Communes illimitees", "Tout le plan Pro", "Alertes SMS / WhatsApp sur devis", "Acces API B2B", "Historique 3 ans", "Support prioritaire"]'::jsonb
WHERE tier = 'business';

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aquagwada-send-trial-emails') THEN
    PERFORM cron.unschedule('aquagwada-send-trial-emails');
  END IF;
END $$;

SELECT cron.schedule(
  'aquagwada-send-trial-emails',
  '0 */6 * * *',
  $$ SELECT net.http_post(
    url := 'https://aquagwada.fr/api/public/jobs/send-trial-emails',
    headers := public.aquagwada_cron_headers(),
    body := '{}'::jsonb
  ); $$
);
