import { supabase } from "@/integrations/supabase/client";

export type HistoryEntry = {
  id: string;
  commune_id: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  source: string;
  source_url: string | null;
  reliability_score: number;
  confidence_score: number;
  cause: string | null;
  sector: string | null;
  commune?: { name: string; slug: string } | null;
};

async function scopeToCurrentUserCommunes(communeIds?: string[]): Promise<string[] | undefined> {
  const requested = Array.from(new Set((communeIds ?? []).filter(Boolean)));
  if (requested.length === 0) return undefined;

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("user_communes")
    .select("commune_id")
    .eq("user_id", userId)
    .in("commune_id", requested);

  if (error) throw error;
  return (data ?? []).map((row) => row.commune_id);
}

/** Paginated history. Free: 7 days / Pro: 365 / Business: capped to 1825 days. */
export async function fetchHistory(opts: {
  communeIds?: string[];
  daysBack?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: HistoryEntry[]; total: number }> {
  const scopedCommuneIds = await scopeToCurrentUserCommunes(opts.communeIds);
  if (opts.communeIds?.length && scopedCommuneIds?.length === 0) return { rows: [], total: 0 };

  const days = Math.min(opts.daysBack ?? 30, 1825);
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(2000, Math.max(10, opts.pageSize ?? 30));
  const fromIso = new Date(Date.now() - days * 86400_000).toISOString();

  let q = supabase
    .from("outage_history")
    .select("*, commune:communes(name,slug)", { count: "exact" })
    .gte("starts_at", fromIso)
    .order("starts_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (scopedCommuneIds && scopedCommuneIds.length) q = q.in("commune_id", scopedCommuneIds);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as HistoryEntry[], total: count ?? 0 };
}

/** History inside a precise window, used by multi-commune timelines. */
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
