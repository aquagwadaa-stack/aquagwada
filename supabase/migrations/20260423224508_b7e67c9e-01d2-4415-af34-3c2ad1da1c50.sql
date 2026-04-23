-- 1. Nouvelles colonnes dans notification_preferences
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS notify_preventive_water_back boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preventive_water_back_hours_before integer NOT NULL DEFAULT 1;

-- 2. Fonction qui réinitialise les préférences payantes quand un user retombe en free
CREATE OR REPLACE FUNCTION public.reset_paid_notification_prefs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si le tier passe à free (peu importe la raison : essai expiré, annulation, etc.)
  IF NEW.tier = 'free' AND (OLD.tier IS DISTINCT FROM NEW.tier OR OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.notification_preferences
    SET sms_enabled = false,
        whatsapp_enabled = false,
        notify_preventive = false,
        notify_preventive_water_back = false,
        updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Trigger sur subscriptions
DROP TRIGGER IF EXISTS trg_reset_paid_notif_prefs ON public.subscriptions;
CREATE TRIGGER trg_reset_paid_notif_prefs
  AFTER UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_paid_notification_prefs();