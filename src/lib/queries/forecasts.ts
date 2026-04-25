import { supabase } from "@/integrations/supabase/client";

export type Forecast = {
  id: string;
  commune_id: string;
  kind: "official_schedule" | "statistical_forecast";
  forecast_date: string; // YYYY-MM-DD
  window_start: string | null; // HH:MM:SS
  window_end: string | null;
  probability: number;
  confidence: number;
  expected_duration_minutes: number | null;
  basis: string | null;
  sample_size: number;
  trend: "improving" | "stable" | "worsening";
  day_of_week_signal: number;
  commune?: { name: string; slug: string } | null;
};

/** RÃ©cupÃ¨re les prÃ©visions sur une fenÃªtre de dates, pour des communes optionnelles. */
export async function fetchForecastsRange(
  fromDate: string, // YYYY-MM-DD
  toDate: string,
  communeIds?: string[]
): Promise<Forecast[]> {
  let q = supabase
    .from("forecasts")
    .select("*, commune:communes(name,slug)")
    .gte("forecast_date", fromDate)
    .lte("forecast_date", toDate)
    .order("forecast_date", { ascending: true });
  if (communeIds && communeIds.length) q = q.in("commune_id", communeIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Forecast[];
}

export async function fetchForecastsForDay(
  date: Date,
  communeIds?: string[]
): Promise<Forecast[]> {
  const iso = date.toISOString().slice(0, 10);
  return fetchForecastsRange(iso, iso, communeIds);
}
