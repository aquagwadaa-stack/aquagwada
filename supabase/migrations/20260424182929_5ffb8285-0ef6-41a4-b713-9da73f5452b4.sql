-- 1) Extensions pour scheduler des jobs HTTP depuis la base
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2) Ajustement durée d'historique des plans
UPDATE public.subscription_plans
SET history_days = 365,
    features = '["5 communes suivies", "Notifications push (PWA) illimitées", "Alertes par email illimitées", "Notifications préventives (jusqu''à 48h avant)", "Prévisions à 14 jours", "Historique 1 an", "Sans engagement"]'::jsonb
WHERE tier = 'pro';

UPDATE public.subscription_plans
SET history_days = 1095,
    features = '["Communes illimitées", "Tout le plan Pro", "Alertes SMS (volume sur devis)", "Alertes WhatsApp (volume sur devis)", "Accès API B2B", "Historique 3 ans", "Support prioritaire dédié"]'::jsonb
WHERE tier = 'business';

UPDATE public.subscription_plans
SET features = '["1 commune suivie", "Notifications push (PWA) en temps réel", "Alertes par email", "Carte temps réel", "Historique 7 jours"]'::jsonb
WHERE tier = 'free';