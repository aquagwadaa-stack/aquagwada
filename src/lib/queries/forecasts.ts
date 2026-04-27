import { supabase } from "@/integrations/supabase/client";

export type Forecast = {
  id: string;
  commune_id: string;
  kind?: "official_schedule" | "statistical_forecast";
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

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Recupere les previsions sur une fenetre de dates, pour des communes optionnelles. */
export async function fetchForecastsRange(
  fromDate: string, // YYYY-MM-DD
  toDate: string,
  communeIds?: string[]
): Promise<Forecast[]> {
  // On inclut J-1 pour afficher les continuations apres minuit
  // (ex: lundi 20:00 -> mardi 06:00 doit apparaitre mardi 00:00 -> 06:00).
  const queryFromDate = addDays(fromDate, -1);

  let q = supabase
    .from("forecasts")
    .select("*, commune:communes(name,slug)")
    .gte("forecast_date", queryFromDate)
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
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const iso = `${year}-${month}-${day}`;
  return fetchForecastsRange(iso, iso, communeIds);
}
