import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Moteur de prévisions v2 — analyse de patterns sur 1 à 3 ans d'historique.
 *
 * Améliorations vs v1 :
 *   - Fenêtre d'analyse étendue (jusqu'à 3 ans)
 *   - Détection de patterns par jour de la semaine (lundi, mardi…)
 *   - Détection de patterns horaires récurrents (buckets 2h)
 *   - Probabilité combinée : base globale × signal jour-semaine
 *   - Tendance : récente (60j) vs historique long → improving / stable / worsening
 *   - Confiance pondérée par taille d'échantillon ET fraîcheur
 */

const HISTORY_DAYS_LONG = 365 * 3;     // jusqu'à 3 ans
const HISTORY_DAYS_RECENT = 60;         // pour calcul de tendance
const FORECAST_DAYS = 14;
const MIN_SAMPLE_FOR_PREDICTION = 4;
const MIN_PROBABILITY_KEEP = 0.05;

type HistRow = { commune_id: string; starts_at: string; duration_minutes: number };

function hourBucket(d: Date): number {
  return Math.floor(d.getHours() / 2) * 2;
}

function modeBucket(buckets: number[]): { hour: number; count: number } {
  const tally = new Map<number, number>();
  for (const b of buckets) tally.set(b, (tally.get(b) ?? 0) + 1);
  let best = { hour: 8, count: 0 };
  for (const [h, c] of tally) if (c > best.count) best = { hour: h, count: c };
  return best;
}

/**
 * Calcule un signal de jour de la semaine : ratio coupures sur ce jour
 * vs moyenne globale. >1 = jour à risque, <1 = jour calme.
 */
function dayOfWeekSignals(events: HistRow[]): number[] {
  const counts = new Array(7).fill(0);
  for (const e of events) counts[new Date(e.starts_at).getDay()]++;
  const avg = events.length / 7;
  if (avg === 0) return new Array(7).fill(1);
  return counts.map((c) => c / avg);
}

/**
 * Tendance = comparaison fréquence des 60 derniers jours vs fréquence
 * historique. Renvoie un libellé qualitatif.
 */
function computeTrend(events: HistRow[]): "improving" | "stable" | "worsening" {
  if (events.length < 6) return "stable";
  const cutoff = Date.now() - HISTORY_DAYS_RECENT * 86400_000;
  const recent = events.filter((e) => new Date(e.starts_at).getTime() >= cutoff).length;
  const recentRate = recent / HISTORY_DAYS_RECENT;
  const olderEvents = events.filter((e) => new Date(e.starts_at).getTime() < cutoff).length;
  const olderDays = Math.max(30, Math.min(HISTORY_DAYS_LONG, (Date.now() - new Date(events[0].starts_at).getTime()) / 86400_000) - HISTORY_DAYS_RECENT);
  const olderRate = olderEvents / olderDays;
  if (olderRate === 0) return recentRate > 0 ? "worsening" : "stable";
  const ratio = recentRate / olderRate;
  if (ratio < 0.7) return "improving";
  if (ratio > 1.3) return "worsening";
  return "stable";
}

export async function generateForecasts(): Promise<{ generated: number; communes: number; trend_breakdown: Record<string, number> }> {
  const { data: communes, error: cErr } = await supabaseAdmin.from("communes").select("id, name");
  if (cErr) throw cErr;

  const fromIso = new Date(Date.now() - HISTORY_DAYS_LONG * 86400_000).toISOString();

  const { data: history, error: hErr } = await supabaseAdmin
    .from("outage_history")
    .select("commune_id, starts_at, duration_minutes")
    .gte("starts_at", fromIso);
  if (hErr) throw hErr;

  const { data: resolvedOutages } = await supabaseAdmin
    .from("outages")
    .select("commune_id, starts_at, ends_at")
    .gte("starts_at", fromIso)
    .in("status", ["resolved", "cancelled"])
    .not("ends_at", "is", null);

  const allHist: HistRow[] = [
    ...((history ?? []) as HistRow[]),
    ...((resolvedOutages ?? []).map((r: any) => ({
      commune_id: r.commune_id,
      starts_at: r.starts_at,
      duration_minutes: Math.max(1, Math.round((new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()) / 60000)),
    }))),
  ];

  // Tri par date asc pour le calcul de tendance
  allHist.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  const byCommune = new Map<string, HistRow[]>();
  for (const row of allHist) {
    const arr = byCommune.get(row.commune_id) ?? [];
    arr.push(row);
    byCommune.set(row.commune_id, arr);
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  await supabaseAdmin.from("forecasts").delete().gte("forecast_date", today.toISOString().slice(0, 10));

  let generated = 0;
  const trend_breakdown: Record<string, number> = { improving: 0, stable: 0, worsening: 0 };
  const rows: any[] = [];

  for (const c of communes ?? []) {
    const events = byCommune.get(c.id) ?? [];
    if (events.length < MIN_SAMPLE_FOR_PREDICTION) continue;

    const buckets = events.map((e) => hourBucket(new Date(e.starts_at)));
    const mode = modeBucket(buckets);
    const avgDuration = Math.round(events.reduce((s, e) => s + e.duration_minutes, 0) / events.length);

    const uniqueDays = new Set(events.map((e) => e.starts_at.slice(0, 10))).size;
    const observedSpan = Math.min(HISTORY_DAYS_LONG, Math.max(30, (Date.now() - new Date(events[0].starts_at).getTime()) / 86400_000));
    const baseProbability = Math.min(0.95, uniqueDays / observedSpan);

    if (baseProbability < MIN_PROBABILITY_KEEP) continue;

    const dowSignals = dayOfWeekSignals(events);
    const trend = computeTrend(events);
    trend_breakdown[trend]++;

    // Confiance : log de l'échantillon + bonus fraîcheur (+0.05 si >=10 events sur 60j)
    const recentCount = events.filter((e) => new Date(e.starts_at).getTime() >= Date.now() - HISTORY_DAYS_RECENT * 86400_000).length;
    const freshnessBonus = recentCount >= 10 ? 0.08 : recentCount >= 3 ? 0.04 : 0;
    const confidence = Math.min(0.92, 0.25 + Math.log10(events.length + 1) * 0.22 + freshnessBonus);

    for (let dOff = 1; dOff <= FORECAST_DAYS; dOff++) {
      const date = new Date(today.getTime() + dOff * 86400_000);
      const dateStr = date.toISOString().slice(0, 10);
      const dow = date.getDay();
      const dowSignal = dowSignals[dow]; // 1.0 = neutre

      // Probabilité combinée : base × jour de semaine, plafonnée
      const adjusted = Math.min(0.95, baseProbability * Math.max(0.4, Math.min(2, dowSignal)));
      if (adjusted < MIN_PROBABILITY_KEEP) continue;

      const winStart = `${String(mode.hour).padStart(2, "0")}:00:00`;
      const winEndH = Math.min(23, mode.hour + Math.max(2, Math.ceil(avgDuration / 60)));
      const winEnd = `${String(winEndH).padStart(2, "0")}:00:00`;

      const dayBasis: string[] = [];
      dayBasis.push(`${events.length} coupures historiques (${Math.round(observedSpan)}j observés)`);
      dayBasis.push(`Plage modale ${winStart}–${winEnd}`);
      if (Math.abs(dowSignal - 1) > 0.25) {
        dayBasis.push(`${date.toLocaleDateString("fr-FR", { weekday: "long" })}s ${dowSignal > 1 ? "à risque" : "plutôt calmes"} (${dowSignal.toFixed(2)}×)`);
      }
      if (trend !== "stable") {
        dayBasis.push(trend === "improving" ? "tendance récente : en amélioration" : "tendance récente : en aggravation");
      }

      rows.push({
        commune_id: c.id,
        forecast_date: dateStr,
        window_start: winStart,
        window_end: winEnd,
        probability: Number(adjusted.toFixed(2)),
        confidence: Number(confidence.toFixed(2)),
        expected_duration_minutes: avgDuration,
        sample_size: events.length,
        trend,
        day_of_week_signal: Number(dowSignal.toFixed(2)),
        basis: dayBasis.join(". ") + ".",
      });
      generated++;
    }
  }

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabaseAdmin.from("forecasts").upsert(slice, {
      onConflict: "commune_id,forecast_date,window_start",
    });
    if (error) throw error;
  }

  return { generated, communes: byCommune.size, trend_breakdown };
}
