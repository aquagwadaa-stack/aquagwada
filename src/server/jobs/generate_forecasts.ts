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
const MIN_SAMPLE_FOR_PREDICTION = 5;
const MIN_PROBABILITY_KEEP = 0.1;

type HistRow = {
  commune_id: string;
  starts_at: string;
  duration_minutes: number;
  /** Poids de fiabilité de la source (1.0 = SMGEAG officiel, 0.8 = Facebook officiel, 0.4 = users) */
  weight: number;
};

/** Saisonnalité Guadeloupe : carême (fév-mai) = sec, hivernage (juil-nov) = humide. */
function seasonalMultiplier(date: Date): number {
  const m = date.getMonth(); // 0-11
  // Carême sec → +30% de risque
  if (m >= 1 && m <= 4) return 1.3;
  // Hivernage humide → -30% (mais grosses pluies = parfois travaux)
  if (m >= 6 && m <= 10) return 0.85;
  return 1.0;
}

/** Détecte un pattern récurrent : ex. "tous les mardis vers 22h". */
function detectRecurrence(events: HistRow[]): { dow: number; hour: number; strength: number } | null {
  if (events.length < 6) return null;
  // bucket (dow, heure_2h) → count
  const tally = new Map<string, number>();
  for (const e of events) {
    const d = new Date(e.starts_at);
    const key = `${d.getDay()}_${Math.floor(d.getHours() / 2) * 2}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  let best = { key: "", count: 0 };
  for (const [k, c] of tally) if (c > best.count) best = { key: k, count: c };
  // Force : ratio sur la moyenne des autres buckets
  const avg = events.length / Math.max(1, tally.size);
  const strength = best.count / avg;
  if (strength < 2.5 || best.count < 3) return null; // pas assez net
  const [dowStr, hourStr] = best.key.split("_");
  return { dow: Number(dowStr), hour: Number(hourStr), strength };
}

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
    .select("commune_id, starts_at, duration_minutes, source, reliability_score")
    .gte("starts_at", fromIso);
  if (hErr) throw hErr;

  const { data: resolvedOutages } = await supabaseAdmin
    .from("outages")
    .select("commune_id, starts_at, ends_at, source, reliability_score")
    .gte("starts_at", fromIso)
    .in("status", ["resolved", "cancelled"])
    .not("ends_at", "is", null);

  // Pondération par source : official=1.0, facebook=0.8, user=0.4
  function sourceWeight(src: string | null | undefined, rel: number | null | undefined): number {
    const r = typeof rel === "number" ? rel : 0.5;
    if (src === "official") return Math.max(0.9, r);
    if (src === "facebook") return Math.max(0.7, r);
    if (src === "user") return Math.min(0.5, Math.max(0.3, r));
    return r;
  }

  const allHist: HistRow[] = [
    ...((history ?? []).map((h: { commune_id: string; starts_at: string; duration_minutes: number; source: string | null; reliability_score: number | null }) => ({
      commune_id: h.commune_id,
      starts_at: h.starts_at,
      duration_minutes: h.duration_minutes,
      weight: sourceWeight(h.source, h.reliability_score),
    }))),
    ...((resolvedOutages ?? [])
      .filter((r): r is typeof r & { ends_at: string } => !!r.ends_at)
      .map((r) => ({
        commune_id: r.commune_id,
        starts_at: r.starts_at,
        duration_minutes: Math.max(1, Math.round((new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()) / 60000)),
        weight: sourceWeight(r.source, r.reliability_score),
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
  await supabaseAdmin
    .from("forecasts")
    .delete()
    .gte("forecast_date", today.toISOString().slice(0, 10))
    .not("basis", "like", "Planning officiel SMGEAG%");

  let generated = 0;
  const trend_breakdown: Record<string, number> = { improving: 0, stable: 0, worsening: 0 };
  const rows: any[] = [];

  for (const c of communes ?? []) {
    const events = byCommune.get(c.id) ?? [];
    if (events.length < MIN_SAMPLE_FOR_PREDICTION) continue;

    const buckets = events.map((e) => hourBucket(new Date(e.starts_at)));
    const mode = modeBucket(buckets);
    // Durée moyenne pondérée par fiabilité de source
    const totalWeight = events.reduce((s, e) => s + e.weight, 0) || 1;
    const avgDuration = Math.round(events.reduce((s, e) => s + e.duration_minutes * e.weight, 0) / totalWeight);

    // Volume pondéré : signalements users comptent moins
    const weightedVolume = events.reduce((s, e) => s + e.weight, 0);
    const uniqueDays = new Set(events.map((e) => e.starts_at.slice(0, 10))).size;
    const observedSpan = Math.min(HISTORY_DAYS_LONG, Math.max(7, (Date.now() - new Date(events[0].starts_at).getTime()) / 86400_000));
    // Mélange : densité brute (jours uniques) × facteur volume pondéré
    const baseProbability = Math.max(
      0.06,
      Math.min(0.95, (uniqueDays / observedSpan) * Math.min(1.5, 0.6 + weightedVolume / Math.max(1, events.length)))
    );

    if (baseProbability < MIN_PROBABILITY_KEEP) continue;

    const dowSignals = dayOfWeekSignals(events);
    const trend = computeTrend(events);
    trend_breakdown[trend]++;
    const recurrence = detectRecurrence(events);

    // Confiance : log de l'échantillon + bonus fraîcheur (+0.05 si >=10 events sur 60j)
    const recentCount = events.filter((e) => new Date(e.starts_at).getTime() >= Date.now() - HISTORY_DAYS_RECENT * 86400_000).length;
    const freshnessBonus = recentCount >= 10 ? 0.08 : recentCount >= 3 ? 0.04 : 0;
    const confidence = Math.min(0.92, 0.25 + Math.log10(events.length + 1) * 0.22 + freshnessBonus);

    for (let dOff = 1; dOff <= FORECAST_DAYS; dOff++) {
      const date = new Date(today.getTime() + dOff * 86400_000);
      const dateStr = date.toISOString().slice(0, 10);
      const dow = date.getDay();
      const dowSignal = dowSignals[dow]; // 1.0 = neutre

      const season = seasonalMultiplier(date);
      const recurrenceBoost = recurrence && recurrence.dow === dow ? Math.min(1.8, 1 + recurrence.strength / 5) : 1;
      // Probabilité combinée : base × jour-semaine × saison × récurrence
      const adjusted = Math.min(0.95, baseProbability * Math.max(0.4, Math.min(2, dowSignal)) * season * recurrenceBoost);
      if (adjusted < MIN_PROBABILITY_KEEP) continue;

      const winStart = `${String(mode.hour).padStart(2, "0")}:00:00`;
      const winEndH = Math.min(23, mode.hour + Math.max(2, Math.ceil(avgDuration / 60)));
      const winEnd = `${String(winEndH).padStart(2, "0")}:00:00`;

      const dayBasis: string[] = [];
      dayBasis.push(`${events.length} événements historiques pondérés (${Math.round(observedSpan)}j observés)`);
      dayBasis.push(`Plage modale ${winStart}–${winEnd}`);
      if (Math.abs(dowSignal - 1) > 0.25) {
        dayBasis.push(`${date.toLocaleDateString("fr-FR", { weekday: "long" })}s ${dowSignal > 1 ? "à risque" : "plutôt calmes"} (${dowSignal.toFixed(2)}×)`);
      }
      if (season !== 1.0) {
        dayBasis.push(season > 1 ? "saison sèche (carême) → risque accru" : "hivernage → risque modéré");
      }
      if (recurrence && recurrence.dow === dow) {
        dayBasis.push(`pattern récurrent détecté (force ${recurrence.strength.toFixed(1)}×)`);
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
