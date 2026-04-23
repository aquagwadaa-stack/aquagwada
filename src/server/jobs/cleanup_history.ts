import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Nettoie les coupures terminées (resolved/cancelled) du table outages
 * une fois qu'elles sont bien archivées dans outage_history.
 * Garde uniquement le temps réel et les futures dans `outages`.
 */
export async function cleanupHistory(): Promise<{ archived: number; deleted: number }> {
  const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString(); // > 7j

  // S'assurer que tout est archivé (le trigger le fait déjà, mais filet de sécurité)
  const { data: toArchive } = await supabaseAdmin
    .from("outages")
    .select("id, commune_id, starts_at, ends_at, sector, cause, description, source, source_url, external_id, reliability_score, confidence_score, time_precision")
    .in("status", ["resolved", "cancelled"])
    .not("ends_at", "is", null)
    .lt("ends_at", cutoff);

  if (toArchive && toArchive.length > 0) {
    const rows = toArchive.map((o: any) => ({
      original_outage_id: o.id,
      commune_id: o.commune_id,
      sector: o.sector,
      starts_at: o.starts_at,
      ends_at: o.ends_at,
      duration_minutes: Math.max(1, Math.round((new Date(o.ends_at).getTime() - new Date(o.starts_at).getTime()) / 60000)),
      cause: o.cause,
      description: o.description,
      source: o.source,
      source_url: o.source_url,
      external_id: o.external_id,
      reliability_score: o.reliability_score,
      confidence_score: o.confidence_score,
      time_precision: o.time_precision,
    }));
    await supabaseAdmin.from("outage_history").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  }

  // Supprimer du table actif
  const { data: deleted, error } = await supabaseAdmin
    .from("outages")
    .delete()
    .in("status", ["resolved", "cancelled"])
    .not("ends_at", "is", null)
    .lt("ends_at", cutoff)
    .select("id");
  if (error) throw error;

  return { archived: toArchive?.length ?? 0, deleted: deleted?.length ?? 0 };
}