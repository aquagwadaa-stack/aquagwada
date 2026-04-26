-- Étendre la table subscriptions pour Stripe
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS price_id text,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id
  ON public.subscriptions(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_env
  ON public.subscriptions(user_id, environment);

-- Helper RPC : un abonnement actif pour cet utilisateur dans l'environnement donné
CREATE OR REPLACE FUNCTION public.has_active_subscription(
  user_uuid uuid,
  check_env text DEFAULT 'live'
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = user_uuid
      AND environment = check_env
      AND tier IN ('pro','business')
      AND (
        (status IN ('active','trialing') AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status = 'canceled' AND current_period_end > now())
      )
  );
$$;