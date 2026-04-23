import { supabase } from "@/integrations/supabase/client";
import type { Tier } from "@/lib/subscription";

export type SubscriptionRow = {
  id: string;
  tier: Tier;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  trial_ends_at: string | null;
  current_period_end: string | null;
};

/**
 * Récupère l'abonnement effectif via la fonction SQL SECURITY DEFINER.
 * - Trial actif → tier="pro"
 * - Trial expiré → bascule auto en free/expired côté DB
 * - Sinon → tier réel
 */
export async function fetchEffectiveSubscription(userId: string): Promise<{
  tier: Tier;
  status: SubscriptionRow["status"];
  trialEndsAt: string | null;
  trialActive: boolean;
  trialExpired: boolean;
}> {
  void userId; // l'auth.uid() est résolu côté serveur par la RPC
  const { data, error } = await supabase.rpc("get_effective_subscription");
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    tier: ((r.tier as Tier) ?? "free"),
    status: ((r.status as SubscriptionRow["status"]) ?? "active"),
    trialEndsAt: (r.trial_ends_at as string | null) ?? null,
    trialActive: Boolean(r.trial_active),
    trialExpired: Boolean(r.trial_expired),
  };
}

/**
 * Démarre un essai gratuit Pro de 7 jours pour l'utilisateur courant.
 * Délègue à la fonction SQL `start_pro_trial` (SECURITY DEFINER) pour éviter
 * tous les problèmes RLS d'UPDATE depuis le client.
 */
export async function startProTrial(userId: string, days = 7): Promise<{ ok: boolean; reason?: string }> {
  void userId;
  const { data, error } = await supabase.rpc("start_pro_trial", { _days: days });
  if (error) return { ok: false, reason: error.message };
  const r = (data ?? {}) as Record<string, unknown>;
  if (!r.ok) return { ok: false, reason: (r.reason as string) ?? "Activation refusée" };
  return { ok: true };
}