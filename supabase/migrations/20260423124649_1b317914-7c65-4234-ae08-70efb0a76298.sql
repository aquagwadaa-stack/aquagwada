
-- =========== ENUMS ===========
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
CREATE TYPE public.outage_status AS ENUM ('scheduled', 'ongoing', 'resolved', 'cancelled');
CREATE TYPE public.outage_source AS ENUM ('official', 'scraping', 'user_report', 'forecast');
CREATE TYPE public.report_status AS ENUM ('water_off', 'low_pressure', 'water_back', 'unknown');
CREATE TYPE public.subscription_tier AS ENUM ('free', 'pro', 'business');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'expired');

-- =========== COMMUNES ===========
CREATE TABLE public.communes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  insee_code TEXT UNIQUE,
  population INTEGER,
  latitude NUMERIC(10,6),
  longitude NUMERIC(10,6),
  region TEXT DEFAULT 'Guadeloupe',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_communes_slug ON public.communes(slug);

-- =========== OUTAGES ===========
CREATE TABLE public.outages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commune_id UUID NOT NULL REFERENCES public.communes(id) ON DELETE CASCADE,
  sector TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  estimated_duration_minutes INTEGER,
  status public.outage_status NOT NULL DEFAULT 'scheduled',
  source public.outage_source NOT NULL DEFAULT 'official',
  reliability_score NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (reliability_score >= 0 AND reliability_score <= 1),
  cause TEXT,
  description TEXT,
  source_url TEXT,
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outages_commune ON public.outages(commune_id);
CREATE INDEX idx_outages_starts ON public.outages(starts_at DESC);
CREATE INDEX idx_outages_status ON public.outages(status);
CREATE UNIQUE INDEX idx_outages_external ON public.outages(source, external_id) WHERE external_id IS NOT NULL;

-- =========== REPORTS ===========
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commune_id UUID NOT NULL REFERENCES public.communes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.report_status NOT NULL,
  comment TEXT,
  latitude NUMERIC(10,6),
  longitude NUMERIC(10,6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_commune ON public.reports(commune_id);
CREATE INDEX idx_reports_created ON public.reports(created_at DESC);

-- =========== PROFILES ===========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========== USER COMMUNES (favoris) ===========
CREATE TABLE public.user_communes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  commune_id UUID NOT NULL REFERENCES public.communes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, commune_id)
);
CREATE INDEX idx_user_communes_user ON public.user_communes(user_id);

-- =========== NOTIFICATION PREFERENCES ===========
CREATE TABLE public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  notify_outage_start BOOLEAN NOT NULL DEFAULT true,
  notify_water_back BOOLEAN NOT NULL DEFAULT true,
  notify_preventive BOOLEAN NOT NULL DEFAULT true,
  preventive_hours_before INTEGER NOT NULL DEFAULT 24,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========== SUBSCRIPTION PLANS ===========
CREATE TABLE public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier public.subscription_tier NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_eur_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_eur_yearly NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_communes INTEGER NOT NULL DEFAULT 1,
  history_days INTEGER NOT NULL DEFAULT 7,
  forecast_days INTEGER NOT NULL DEFAULT 0,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  api_access BOOLEAN NOT NULL DEFAULT false,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- =========== SUBSCRIPTIONS ===========
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier public.subscription_tier NOT NULL DEFAULT 'free',
  status public.subscription_status NOT NULL DEFAULT 'active',
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- =========== USER ROLES ===========
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- =========== FORECASTS ===========
CREATE TABLE public.forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commune_id UUID NOT NULL REFERENCES public.communes(id) ON DELETE CASCADE,
  forecast_date DATE NOT NULL,
  window_start TIME,
  window_end TIME,
  probability NUMERIC(3,2) NOT NULL CHECK (probability >= 0 AND probability <= 1),
  basis TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (commune_id, forecast_date, window_start)
);
CREATE INDEX idx_forecasts_commune_date ON public.forecasts(commune_id, forecast_date);

-- =========== SECURITY DEFINER: has_role ===========
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- =========== UPDATED_AT TRIGGER ===========
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_outages_updated BEFORE UPDATE ON public.outages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_notification_preferences_updated BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========== SIGNUP TRIGGER ===========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');

  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========== RLS ===========
ALTER TABLE public.communes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_communes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;

-- communes: lecture publique, écriture admin/mod
CREATE POLICY "communes_read_all" ON public.communes FOR SELECT USING (true);
CREATE POLICY "communes_write_admin" ON public.communes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- outages: lecture publique, écriture mod/admin
CREATE POLICY "outages_read_all" ON public.outages FOR SELECT USING (true);
CREATE POLICY "outages_insert_mod" ON public.outages FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
CREATE POLICY "outages_update_mod" ON public.outages FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
CREATE POLICY "outages_delete_admin" ON public.outages FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- reports: lecture publique, création par tout user authentifié, modif/suppr par auteur
CREATE POLICY "reports_read_all" ON public.reports FOR SELECT USING (true);
CREATE POLICY "reports_insert_authed" ON public.reports FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);
CREATE POLICY "reports_update_owner" ON public.reports FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "reports_delete_owner" ON public.reports FOR DELETE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'moderator'));

-- profiles: chacun voit/édite le sien
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- user_communes
CREATE POLICY "user_communes_select_own" ON public.user_communes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_communes_insert_own" ON public.user_communes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_communes_update_own" ON public.user_communes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_communes_delete_own" ON public.user_communes FOR DELETE USING (auth.uid() = user_id);

-- notification_preferences
CREATE POLICY "notif_pref_select_own" ON public.notification_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notif_pref_update_own" ON public.notification_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "notif_pref_insert_own" ON public.notification_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);

-- subscription_plans: lecture publique
CREATE POLICY "plans_read_public" ON public.subscription_plans FOR SELECT USING (is_public);
CREATE POLICY "plans_admin_all" ON public.subscription_plans FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- subscriptions
CREATE POLICY "subs_select_own" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "subs_insert_own" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subs_admin_all" ON public.subscriptions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- user_roles: lecture par soi-même + admin, écriture admin
CREATE POLICY "roles_select_own" ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_all" ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- forecasts: lecture publique, écriture mod/admin
CREATE POLICY "forecasts_read_all" ON public.forecasts FOR SELECT USING (true);
CREATE POLICY "forecasts_write_mod" ON public.forecasts FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
