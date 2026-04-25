import { supabase } from "@/integrations/supabase/client";

export type CommuneStatus = {
  status: "ok" | "outage" | "partial";
  next_cut: string | null;
  water_back_at: string | null;
  ongoing_count: number;
  confidence: number;
};

export async function fetchCommuneStatus(communeId: string): Promise<CommuneStatus> {
  const { data, error } = await supabase.rpc("get_commune_status", { _commune_id: communeId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { status: "ok", next_cut: null, water_back_at: null, ongoing_count: 0, confidence: 0.9 };
  return {
    status: (row.status as CommuneStatus["status"]) ?? "ok",
    next_cut: row.next_cut,
    water_back_at: row.water_back_at,
    ongoing_count: row.ongoing_count ?? 0,
    confidence: Number(row.confidence ?? 0.9),
  };
}