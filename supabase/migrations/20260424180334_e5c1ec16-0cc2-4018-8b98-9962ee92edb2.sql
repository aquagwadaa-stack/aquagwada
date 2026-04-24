-- Mise à jour Pro (5,99€, sans SMS) et Business (à partir de 25€, devis)
UPDATE public.subscription_plans
SET 
  price_eur_monthly = 5.99,
  price_eur_yearly = 59,
  max_communes = 5,
  history_days = 180,
  forecast_days = 14,
  sms_enabled = false,
  whatsapp_enabled = false,
  api_access = false,
  features = '["5 communes suivies","Notifications push (PWA) illimitées","Alertes par email illimitées","Notifications préventives","Prévisions à 14 jours","Historique 6 mois","Sans engagement"]'::jsonb,
  name = 'Pro'
WHERE tier = 'pro';

UPDATE public.subscription_plans
SET 
  price_eur_monthly = 25,
  price_eur_yearly = 250,
  max_communes = 999,
  history_days = 1825,
  forecast_days = 14,
  sms_enabled = true,
  whatsapp_enabled = true,
  api_access = true,
  features = '["Communes illimitées","Tout le plan Pro","Alertes SMS (volume sur devis)","Alertes WhatsApp (volume sur devis)","Accès API B2B","Historique 5 ans","Support prioritaire"]'::jsonb,
  name = 'Business'
WHERE tier = 'business';

UPDATE public.subscription_plans
SET 
  features = '["1 commune suivie","Notifications push (PWA)","Alertes par email","Carte temps réel","Historique 7 jours"]'::jsonb,
  name = 'Gratuit'
WHERE tier = 'free';

-- Désactiver SMS/WhatsApp pour les utilisateurs Pro (rétrocompatibilité)
UPDATE public.notification_preferences np
SET sms_enabled = false, whatsapp_enabled = false, updated_at = now()
FROM public.subscriptions s
WHERE np.user_id = s.user_id
  AND s.tier = 'pro'
  AND s.status IN ('active','trialing');