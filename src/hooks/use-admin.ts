import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import type { Tier } from "@/lib/subscription";

const SIM_TIER_KEY = "aquagwada.admin.sim_tier";

/** Lit le tier simulé courant depuis localStorage (admin only). */
export function getSimulatedTier(): Tier | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(SIM_TIER_KEY);
  if (v === "free" || v === "pro" || v === "business") return v;
  return null;
}

/** Définit (ou efface) le tier simulé. Déclenche un évènement pour notifier les hooks. */
export function setSimulatedTier(t: Tier | null) {
  if (typeof window === "undefined") return;
  if (t) window.localStorage.setItem(SIM_TIER_KEY, t);
  else window.localStorage.removeItem(SIM_TIER_KEY);
  window.dispatchEvent(new Event("aquagwada:sim-tier"));
}

/** Hook réactif qui retourne le tier simulé courant (ou null). */
export function useSimulatedTier(): Tier | null {
  const [t, setT] = useState<Tier | null>(() => getSimulatedTier());
  useEffect(() => {
    const handler = () => setT(getSimulatedTier());
    window.addEventListener("aquagwada:sim-tier", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("aquagwada:sim-tier", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return t;
}

/** Vérifie côté client si l'utilisateur courant a le rôle admin. */
export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const { user, loading: authLoading } = useAuth();
  const q = useQuery({
    queryKey: ["is-admin", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
  });
  return { isAdmin: !!q.data, loading: authLoading || q.isLoading };
}