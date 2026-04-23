import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Moteur de prévisions v1 (statistique simple, pas de ML).
 *
 * Pour chaque commune, analyse l'historique des N derniers jours et :
 *   - calcule le taux de jours avec coupure (probabilité de base)
 *   - identifie la plage horaire la plus fréquente (modale)
 *   - calcule la durée moyenne
 *   - extrapole sur les J prochains jours
 *
 * Stocke dans la table forecasts (unique sur commune_id + date + window_start).
 */

const HISTORY_DAYS = 90;       // fenêtre d'analyse
const FORECAST_DAYS = 14;      // jusqu'à J+14 (Pro)
const MIN_SAMPLE_FOR_PREDICTION = 3;

type HistRow = {
  commune_id: string;
  starts_at: string;
  duration_minutes: number;
};

function hourBucket(d: Date): number {
  // bucket de 2h : 0,2,4...22
  return Math.floor(d.getHours() / 2) * 2;
}

function modeBucket(buckets: number[]): { hour: number; count: number } {
  const tally = new Map<number, number>();
  for (const b of buckets) tally.set(b, (tally.get(b) ?? 0) + 1);
  let best = { hour: 8, count: 0 };
  for (const [h, c] of tally) if (c > best.count) best = { hour: h, count: c };
  return best;
}

export async function generateForecasts(): Promise<{ generated: number; communes: number }> {
  // 1. Charger toutes les communes
  const { data: communes, error: cErr } = await supabaseAdmin.from("communes").select("id, name");
  if (cErr) throw cErr;

  // 2. Charger l'historique global (90 jours)
  const fromIso = new Date(Date.now() - HISTORY_DAYS * 86400_000).toISOString();
  const { data: history, error: hErr } = await supabaseAdmin
    .from("outage_history")
    .select("commune_id, starts_at, duration_minutes")
    .gte("starts_at", fromIso);
  if (hErr) throw hErr;

  // Aussi inclure les outages déjà résolus mais pas encore archivés
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

  // 3. Grouper par commune
  const byCommune = new Map<string, HistRow[]>();
  for (const row of allHist) {
    const arr = byCommune.get(row.commune_id) ?? [];
    arr.push(row);
    byCommune.set(row.commune_id, arr);
  }

  // 4. Purger les forecasts futures précédentes (on les régénère)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  await supabaseAdmin.from("forecasts").delete().gte("forecast_date", today.toISOString().slice(0, 10));

  let generated = 0;
  const rows: any[] = [];

  for (const c of communes ?? []) {
    const events = byCommune.get(c.id) ?? [];
    if (events.length < MIN_SAMPLE_FOR_PREDICTION) continue;

    const buckets = events.map((e) => hourBucket(new Date(e.starts_at)));
    const mode = modeBucket(buckets);
    const avgDuration = Math.round(events.reduce((s, e) => s + e.duration_minutes, 0) / events.length);

    // Probabilité de base : nb jours uniques avec coupure / fenêtre
    const uniqueDays = new Set(events.map((e) => e.starts_at.slice(0, 10))).size;
    const baseProbability = Math.min(0.95, uniqueDays / HISTORY_DAYS);
    const confidence = Math.min(0.9, 0.3 + Math.log10(events.length + 1) * 0.25);

    if (baseProbability < 0.05) continue; // pas assez fréquent → pas de prévision

    for (let dOff = 1; dOff <= FORECAST_DAYS; dOff++) {
      const date = new Date(today.getTime() + dOff * 86400_000);
      const dateStr = date.toISOString().slice(0, 10);
      const winStart = `${String(mode.hour).padStart(2, "0")}:00:00`;
      const winEndH = Math.min(23, mode.hour + Math.max(2, Math.ceil(avgDuration / 60)));
      const winEnd = `${String(winEndH).padStart(2, "0")}:00:00`;

      rows.push({
        commune_id: c.id,
        forecast_date: dateStr,
        window_start: winStart,
        window_end: winEnd,
        probability: Number(baseProbability.toFixed(2)),
        confidence: Number(confidence.toFixed(2)),
        expected_duration_minutes: avgDuration,
        sample_size: events.length,
        basis: `Modèle statistique sur ${events.length} coupures (${HISTORY_DAYS}j). Plage modale ${winStart}-${winEnd}.`,
      });
      generated++;
    }
  }

  // Insertion par lots
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabaseAdmin.from("forecasts").upsert(slice, {
      onConflict: "commune_id,forecast_date,window_start",
    });
    if (error) throw error;
  }

  return { generated, communes: byCommune.size };
}