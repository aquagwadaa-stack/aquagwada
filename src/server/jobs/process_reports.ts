import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Traitement des signalements utilisateurs (toutes les 5 min).
 *
 * Règles :
 *  - water_off / low_pressure sur une coupure en cours -> +confidence (cap 0.95)
 *  - water_back x3 distincts (ou x1 si la coupure dépasse sa durée estimée) -> resolved
 *  - water_off x3 distincts en 90 min sans coupure officielle -> création communautaire
 *
 * Tous les reports traités sont marqués `processed_at = now()`.
 */

const WINDOW_MIN = 90; // fenêtre de regroupement
const CONFIDENCE_BUMP = 0.05;
const CONFIDENCE_CAP = 0.95;
const RESOLVE_THRESHOLD = 3;
const CREATE_THRESHOLD = 3;

type Report = {
  id: string;
  commune_id: string;
  user_id: string | null;
  status: "water_off" | "low_pressure" | "water_back" | "unknown";
  created_at: string;
};

export async function processReports(): Promise<{
  ok: boolean;
  processed: number;
  confirmed: number;
  resolved: number;
  created: number;
  note?: string;
}> {
  const stats = { confirmed: 0, resolved: 0, created: 0 };

  // 1. Charger les reports non traités (limite raisonnable)
  const { data: rawReports, error: rErr } = await supabaseAdmin
    .from("reports")
    .select("id, commune_id, user_id, status, created_at")
    .is("processed_at", null)
    .order("created_at", { ascending: true })
    .limit(500);

  if (rErr) return { ok: false, processed: 0, ...stats, note: rErr.message };
  const reports = (rawReports ?? []) as Report[];
  if (reports.length === 0) return { ok: true, processed: 0, ...stats };

  const processedIds: string[] = [];
  const now = new Date();

  // Grouper par commune pour éviter N requêtes
  const byCommune = new Map<string, Report[]>();
  for (const r of reports) {
    const arr = byCommune.get(r.commune_id) ?? [];
    arr.push(r);
    byCommune.set(r.commune_id, arr);
  }

  for (const [communeId, items] of byCommune.entries()) {
    // Coupures actuellement actives sur la commune
    const nowIso = now.toISOString();
    const { data: active } = await supabaseAdmin
      .from("outages")
      .select("id, starts_at, ends_at, estimated_duration_minutes, confidence_score, status")
      .eq("commune_id", communeId)
      .lte("starts_at", nowIso)
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
      .not("status", "in", "(resolved,cancelled)")
      .order("starts_at", { ascending: false });

    const ongoing = (active ?? [])[0];

    // Bucket par status (utilisateurs distincts)
    const offUsers = new Set<string>();
    const backUsers = new Set<string>();
    const offReports: Report[] = [];
    const backReports: Report[] = [];

    for (const r of items) {
      if (r.status === "water_off" || r.status === "low_pressure") {
        offReports.push(r);
        if (r.user_id) offUsers.add(r.user_id);
      } else if (r.status === "water_back") {
        backReports.push(r);
        if (r.user_id) backUsers.add(r.user_id);
      }
      processedIds.push(r.id);
    }

    // 2. Confirmation : booster confidence si coupure en cours et reports off
    if (ongoing && offReports.length > 0) {
      const distinct = Math.max(1, offUsers.size);
      const bump = Math.min(0.3, distinct * CONFIDENCE_BUMP);
      const newScore = Math.min(CONFIDENCE_CAP, Number(ongoing.confidence_score ?? 0.5) + bump);
      await supabaseAdmin
        .from("outages")
        .update({ confidence_score: newScore, updated_at: now.toISOString() })
        .eq("id", ongoing.id);
      stats.confirmed += 1;
    }

    // 3. Résolution : water_back ≥ 3 OU 1 si coupure dépassée
    if (ongoing && backReports.length > 0) {
      const distinctBack = backUsers.size || backReports.length;
      const overdue =
        ongoing.estimated_duration_minutes &&
        new Date(ongoing.starts_at).getTime() +
          ongoing.estimated_duration_minutes * 60_000 <
          now.getTime();
      if (distinctBack >= RESOLVE_THRESHOLD || (overdue && distinctBack >= 1)) {
        await supabaseAdmin
          .from("outages")
          .update({
            status: "resolved",
            ends_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", ongoing.id);
        stats.resolved += 1;
      }
    }

    // 4. Création communautaire : water_off x3 distincts en 90 min, pas de coupure active
    if (!ongoing && offUsers.size >= CREATE_THRESHOLD) {
      const recent = offReports.filter(
        (r) => now.getTime() - new Date(r.created_at).getTime() <= WINDOW_MIN * 60_000,
      );
      const recentDistinct = new Set(recent.map((r) => r.user_id).filter(Boolean));
      if (recentDistinct.size >= CREATE_THRESHOLD) {
        const conf = Math.min(0.85, 0.4 + recentDistinct.size * 0.1);
        const earliest = recent.reduce(
          (acc, r) => (new Date(r.created_at) < new Date(acc.created_at) ? r : acc),
          recent[0],
        );
        await supabaseAdmin.from("outages").insert({
          commune_id: communeId,
          starts_at: earliest.created_at,
          status: "ongoing",
          source: "user_report",
          reliability_score: 0.5,
          confidence_score: conf,
          cause: "Signalements communautaires concordants",
          description: `Créé automatiquement après ${recentDistinct.size} signalements distincts.`,
          time_precision: "approximate",
          is_estimated: true,
        });
        stats.created += 1;
      }
    }
  }

  // 5. Marquer tous les reports lus comme traités
  if (processedIds.length > 0) {
    await supabaseAdmin
      .from("reports")
      .update({ processed_at: now.toISOString() })
      .in("id", processedIds);
  }

  return { ok: true, processed: processedIds.length, ...stats };
}