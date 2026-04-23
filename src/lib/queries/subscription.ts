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
 * Récupère l'abonnement courant et **applique** la logique d'essai :
 *   - status="trialing" + trial_ends_at futur → tier effectif = pro
 *   - status="trialing" + trial_ends_at passé → on retombe automatiquement
 *     sur free (et la ligne est marquée "expired" en base, idempotent).
 */
export async function fetchEffectiveSubscription(userId: string): Promise<{
  tier: Tier;
  status: SubscriptionRow["status"];
  trialEndsAt: string | null;
  trialActive: boolean;
  trialExpired: boolean;
}> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, tier, status, trial_ends_at, current_period_end")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  const row = data as SubscriptionRow | null;
  if (!row) {
    return { tier: "free", status: "active", trialEndsAt: null, trialActive: false, trialExpired: false };
  }

  const now = Date.now();
  const trialEnd = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : null;
  const trialActive = row.status === "trialing" && trialEnd !== null && trialEnd > now;
  const trialExpired = row.status === "trialing" && trialEnd !== null && trialEnd <= now;

  if (trialExpired) {
    // Auto-rétrogradation côté DB pour rester cohérent (best-effort, pas bloquant).
    await supabase
      .from("subscriptions")
      .update({ status: "expired", tier: "free" })
      .eq("id", row.id);
    return { tier: "free", status: "expired", trialEndsAt: row.trial_ends_at, trialActive: false, trialExpired: true };
  }

  const effectiveTier: Tier = trialActive ? "pro" : (row.tier as Tier);
  return {
    tier: effectiveTier,
    status: row.status,
    trialEndsAt: row.trial_ends_at,
    trialActive,
    trialExpired: false,
  };
}

/**
 * Démarre un essai gratuit Pro de 7 jours pour l'utilisateur courant.
 * - Met à jour la subscription existante (créée par le trigger handle_new_user).
 * - Idempotent : si déjà en trialing/pro/business actif, ne fait rien.
 */
export async function startProTrial(userId: string, days = 7): Promise<{ ok: boolean; reason?: string }> {
  const { data: existing, error: e1 } = await supabase
    .from("subscriptions")
    .select("id, tier, status, trial_ends_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) return { ok: false, reason: e1.message };

  if (existing) {
    const trialEnd = existing.trial_ends_at ? new Date(existing.trial_ends_at).getTime() : null;
    if (existing.status === "trialing" && trialEnd && trialEnd > Date.now()) {
      return { ok: false, reason: "Essai déjà actif" };
    }
    if (existing.status === "active" && (existing.tier === "pro" || existing.tier === "business")) {
      return { ok: false, reason: "Vous avez déjà un plan payant actif" };
    }
  }

  const trialEndsAt = new Date(Date.now() + days * 86400_000).toISOString();
  const startsAt = new Date().toISOString();

  if (existing) {
    const { error } = await supabase.from("subscriptions").update({
      tier: "pro",
      status: "trialing",
      trial_ends_at: trialEndsAt,
      current_period_start: startsAt,
      current_period_end: trialEndsAt,
      cancel_at_period_end: false,
    }).eq("id", existing.id);
    if (error) return { ok: false, reason: error.message };
  } else {
    const { error } = await supabase.from("subscriptions").insert({
      user_id: userId,
      tier: "pro",
      status: "trialing",
      trial_ends_at: trialEndsAt,
      current_period_start: startsAt,
      current_period_end: trialEndsAt,
    });
    if (error) return { ok: false, reason: error.message };
  }
  return { ok: true };
}