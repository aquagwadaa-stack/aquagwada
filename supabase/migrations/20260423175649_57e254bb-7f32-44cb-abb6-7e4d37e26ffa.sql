-- ============================================================
-- Trial system: server-side atomic activation + effective resolver
-- + email reminder tracking
-- ============================================================

-- 1) Atomic trial start (SECURITY DEFINER bypasses RLS safely)
CREATE OR REPLACE FUNCTION public.start_pro_trial(_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  existing record;
  trial_end timestamptz;
  starts timestamptz := now();
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Authentification requise');
  END IF;

  IF _days < 1 OR _days > 30 THEN
    _days := 7;
  END IF;

  trial_end := now() + make_interval(days => _days);

  SELECT id, tier, status, trial_ends_at
  INTO existing
  FROM public.subscriptions
  WHERE user_id = uid
  ORDER BY created_at DESC
  LIMIT 1;

  -- Refuse if already trial or paying
  IF existing.id IS NOT NULL THEN
    IF existing.status = 'trialing' AND existing.trial_ends_at > now() THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'Essai déjà actif');
    END IF;
    IF existing.status = 'active' AND existing.tier IN ('pro','business') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'Vous avez déjà un plan payant actif');
    END IF;
    -- Refuse if a trial was already consumed (expired or canceled trial)
    IF existing.trial_ends_at IS NOT NULL AND existing.trial_ends_at <= now() THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'Vous avez déjà utilisé votre essai gratuit');
    END IF;

    UPDATE public.subscriptions
    SET tier = 'pro',
        status = 'trialing',
        trial_ends_at = trial_end,
        current_period_start = starts,
        current_period_end = trial_end,
        cancel_at_period_end = false,
        updated_at = now()
    WHERE id = existing.id;
  ELSE
    INSERT INTO public.subscriptions
      (user_id, tier, status, trial_ends_at, current_period_start, current_period_end)
    VALUES (uid, 'pro', 'trialing', trial_end, starts, trial_end);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tier', 'pro',
    'status', 'trialing',
    'trial_ends_at', trial_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_pro_trial(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.start_pro_trial(integer) TO authenticated;

-- 2) Effective subscription resolver (auto-downgrade expired trials)
CREATE OR REPLACE FUNCTION public.get_effective_subscription()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row record;
  effective_tier text;
  trial_active boolean := false;
  trial_expired boolean := false;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object(
      'tier', 'free', 'status', 'active',
      'trial_ends_at', null, 'trial_active', false, 'trial_expired', false
    );
  END IF;

  SELECT id, tier, status, trial_ends_at
  INTO row
  FROM public.subscriptions
  WHERE user_id = uid
  ORDER BY created_at DESC
  LIMIT 1;

  IF row.id IS NULL THEN
    RETURN jsonb_build_object(
      'tier', 'free', 'status', 'active',
      'trial_ends_at', null, 'trial_active', false, 'trial_expired', false
    );
  END IF;

  trial_active := (row.status = 'trialing' AND row.trial_ends_at IS NOT NULL AND row.trial_ends_at > now());
  trial_expired := (row.status = 'trialing' AND row.trial_ends_at IS NOT NULL AND row.trial_ends_at <= now());

  IF trial_expired THEN
    UPDATE public.subscriptions
    SET status = 'expired', tier = 'free', updated_at = now()
    WHERE id = row.id;
    RETURN jsonb_build_object(
      'tier', 'free', 'status', 'expired',
      'trial_ends_at', row.trial_ends_at,
      'trial_active', false, 'trial_expired', true
    );
  END IF;

  effective_tier := CASE WHEN trial_active THEN 'pro' ELSE row.tier::text END;

  RETURN jsonb_build_object(
    'tier', effective_tier,
    'status', row.status,
    'trial_ends_at', row.trial_ends_at,
    'trial_active', trial_active,
    'trial_expired', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_effective_subscription() FROM public;
GRANT EXECUTE ON FUNCTION public.get_effective_subscription() TO authenticated, anon;

-- 3) Anti-double-send tracking for trial expiry email reminder
CREATE TABLE IF NOT EXISTS public.trial_email_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL,
  user_id uuid NOT NULL,
  trial_ends_at timestamptz NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL DEFAULT '12h_before',
  UNIQUE (subscription_id, kind)
);

ALTER TABLE public.trial_email_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trial_reminders_admin_all"
ON public.trial_email_reminders FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "trial_reminders_select_own"
ON public.trial_email_reminders FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 4) Auto-expire trials job-friendly function (idempotent)
CREATE OR REPLACE FUNCTION public.expire_overdue_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  WITH upd AS (
    UPDATE public.subscriptions
    SET status = 'expired', tier = 'free', updated_at = now()
    WHERE status = 'trialing'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at <= now()
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_overdue_trials() FROM public;