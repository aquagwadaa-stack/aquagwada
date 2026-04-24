
-- 1. Mise à jour des plans tarifaires
UPDATE public.subscription_plans
SET price_eur_monthly = 5.99,
    price_eur_yearly = 59.99,
    sms_enabled = false,
    whatsapp_enabled = false,
    features = '["Jusqu''à 5 communes suivies","Historique 365 jours","Prévisions 14 jours","Notifications push instantanées","Alertes email illimitées","Notifications préventives (avant coupure et avant retour)","Pas de SMS (push gratuit + temps réel)"]'::jsonb
WHERE tier = 'pro';

UPDATE public.subscription_plans
SET price_eur_monthly = 25.00,
    price_eur_yearly = 250.00,
    sms_enabled = true,
    whatsapp_enabled = true,
    features = '["À partir de 25€/mois — sur devis","Jusqu''à 100 communes (sur demande)","Historique 5 ans","SMS et WhatsApp (volume sur devis)","Accès API B2B","Support prioritaire","Toutes les fonctionnalités Pro incluses"]'::jsonb
WHERE tier = 'business';

UPDATE public.subscription_plans
SET features = '["1 commune favorite","Historique 7 jours","Notifications push instantanées","Alertes email illimitées","Carte interactive temps réel","Signalements communautaires"]'::jsonb
WHERE tier = 'free';

-- 2. Ajout du canal push aux préférences
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT true;

-- 3. Table des inscriptions push (un user peut avoir plusieurs appareils)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_sub_select_own" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "push_sub_insert_own" ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_sub_delete_own" ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "push_sub_update_own" ON public.push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "push_sub_admin_all" ON public.push_subscriptions
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. Table de suivi du scraper
CREATE TABLE IF NOT EXISTS public.scraper_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  url text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  items_found integer NOT NULL DEFAULT 0,
  items_inserted integer NOT NULL DEFAULT 0,
  items_updated integer NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT false,
  error text,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_scraper_runs_started ON public.scraper_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_source ON public.scraper_runs(source, started_at DESC);

ALTER TABLE public.scraper_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scraper_runs_admin_all" ON public.scraper_runs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "scraper_runs_read_mod" ON public.scraper_runs
  FOR SELECT USING (has_role(auth.uid(), 'moderator'::app_role));

-- 5. Mise à jour du trigger de reset pour aussi désactiver le push si le tier devient free... non wait, push reste activé pour free aussi. On garde tel quel mais on ajoute une note.
-- Le trigger existant (reset_paid_notification_prefs) reset déjà sms/whatsapp/preventive quand le tier devient free. C'est bon.
