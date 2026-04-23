import { supabase } from "@/integrations/supabase/client";

export type Outage = {
  id: string;
  commune_id: string;
  sector: string | null;
  starts_at: string;
  ends_at: string | null;
  estimated_duration_minutes: number | null;
  status: "scheduled" | "ongoing" | "resolved" | "cancelled";
  source: "official" | "scraping" | "user_report" | "forecast";
  reliability_score: number;
  cause: string | null;
  description: string | null;
  source_url: string | null;
  commune?: { name: string; slug: string } | null;
};

function normalizeOutageStatus(outage: Outage): Outage {
  const now = Date.now();
  const start = new Date(outage.starts_at).getTime();
  const end = outage.ends_at ? new Date(outage.ends_at).getTime() : null;

  if (outage.status === "cancelled" || outage.status === "resolved") return outage;
  if (end !== null && end < now) return { ...outage, status: "resolved" };
  if (start <= now && (end === null || end >= now) && outage.status === "scheduled") {
    return { ...outage, status: "ongoing" };
  }
  return outage;
}

export async function fetchOutagesWindow(fromIso: string, toIso: string, communeIds?: string[]): Promise<Outage[]> {
  let q = supabase
    .from("outages")
    .select("*, commune:communes(name,slug)")
    .gte("starts_at", fromIso)
    .lte("starts_at", toIso)
    .order("starts_at", { ascending: true });
  if (communeIds && communeIds.length) q = q.in("commune_id", communeIds);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as Outage[]).map(normalizeOutageStatus);
}

export async function fetchOngoingOutages(): Promise<Outage[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("outages")
    .select("*, commune:communes(name,slug)")
    .lte("starts_at", nowIso)
    .or(`ends_at.gte.${nowIso},ends_at.is.null`)
    .neq("status", "resolved")
    .neq("status", "cancelled")
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Outage[]).map(normalizeOutageStatus);
}

export async function fetchOutagesByCommune(communeId: string, days = 30): Promise<Outage[]> {
  const fromIso = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("outages")
    .select("*, commune:communes(name,slug)")
    .eq("commune_id", communeId)
    .gte("starts_at", fromIso)
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Outage[]).map(normalizeOutageStatus);
}