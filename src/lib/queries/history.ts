import { supabase } from "@/integrations/supabase/client";

export type HistoryEntry = {
  id: string;
  commune_id: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  source: string;
  reliability_score: number;
  confidence_score: number;
  cause: string | null;
  sector: string | null;
  commune?: { name: string; slug: string } | null;
};

/** Historique paginé. Limite plan gratuit : 7 jours / Pro : 365 / Business : illimité (cap 1825). */
export async function fetchHistory(opts: {
  communeIds?: string[];
  daysBack?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: HistoryEntry[]; total: number }> {
  const days = Math.min(opts.daysBack ?? 30, 1825);
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 30));
  const fromIso = new Date(Date.now() - days * 86400_000).toISOString();

  let q = supabase
    .from("outage_history")
    .select("*, commune:communes(name,slug)", { count: "exact" })
    .gte("starts_at", fromIso)
    .order("starts_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (opts.communeIds && opts.communeIds.length) q = q.in("commune_id", opts.communeIds);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as HistoryEntry[], total: count ?? 0 };
}

/** Historique dans une fenêtre précise, pour alimenter les timelines multi-communes. */
export async function fetchHistoryRange(fromIso: string, toIso: string, communeIds?: string[]): Promise<HistoryEntry[]> {
  let q = supabase
    .from("outage_history")
    .select("*, commune:communes(name,slug)")
    .lte("starts_at", toIso)
    .gte("ends_at", fromIso)
    .order("starts_at", { ascending: true });

  if (communeIds && communeIds.length) q = q.in("commune_id", communeIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as HistoryEntry[];
}