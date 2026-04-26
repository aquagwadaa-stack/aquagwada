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

function effectiveEndMs(outage: Outage): number {
  if (outage.ends_at) return new Date(outage.ends_at).getTime();
  const start = new Date(outage.starts_at).getTime();
  return start + (outage.estimated_duration_minutes ?? 180) * 60_000;
}

function normalizeOutageStatus(outage: Outage): Outage {
  const now = Date.now();
  const start = new Date(outage.starts_at).getTime();
  const end = effectiveEndMs(outage);

  const withDefaultEstimate = outage.ends_at || outage.estimated_duration_minutes
    ? outage
    : { ...outage, estimated_duration_minutes: 180 };

  if (outage.status === "cancelled" || outage.status === "resolved") return withDefaultEstimate;
  if (end < now) return { ...withDefaultEstimate, status: "resolved" };
  if (start <= now && end >= now && outage.status === "scheduled") {
    return { ...withDefaultEstimate, status: "ongoing" };
  }
  return withDefaultEstimate;
}

export async function fetchOutagesWindow(fromIso: string, toIso: string, communeIds?: string[]): Promise<Outage[]> {
  let q = supabase
    .from("outages")
    .select("*, commune:communes(name,slug)")
    .lte("starts_at", toIso)
    .or(`ends_at.gte.${fromIso},ends_at.is.null,status.eq.ongoing`)
    .order("starts_at", { ascending: true });
  if (communeIds && communeIds.length) q = q.in("commune_id", communeIds);
  const { data, error } = await q;
  if (error) throw error;
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  return ((data ?? []) as unknown as Outage[])
    .map(normalizeOutageStatus)
    .filter((o) => new Date(o.starts_at).getTime() <= toMs && effectiveEndMs(o) >= fromMs);
}

export async function fetchOngoingOutages(communeIds?: string[]): Promise<Outage[]> {
  const nowIso = new Date().toISOString();
  let q = supabase
    .from("outages")
    .select("*, commune:communes(name,slug)")
    .lte("starts_at", nowIso)
    .or(`ends_at.gte.${nowIso},ends_at.is.null`)
    .neq("status", "resolved")
    .neq("status", "cancelled")
    .order("starts_at", { ascending: false });
  if (communeIds && communeIds.length) q = q.in("commune_id", communeIds);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as Outage[])
    .map(normalizeOutageStatus)
    .filter((o) => o.status === "ongoing");
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
