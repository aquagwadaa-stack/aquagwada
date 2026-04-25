import { supabaseAdmin } from "@/integrations/supabase/client.server";

type CleanupSummary = {
  normalized_outages?: number;
  normalized_history?: number;
  deduped_outages?: number;
  deduped_history?: number;
  deduped_forecasts?: number;
};

export async function cleanupHistory(): Promise<CleanupSummary & { archived: number; deleted: number; expiredArchived: number }> {
  const { data: cleanupData, error: cleanupError } = await (supabaseAdmin as any).rpc("cleanup_outage_data");
  if (cleanupError) throw cleanupError;

  const { data: expiredArchived, error: expiredError } = await (supabaseAdmin as any).rpc("archive_expired_outages");
  if (expiredError) throw expiredError;

  const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();

  const { data: toArchive } = await supabaseAdmin
    .from("outages")
    .select("id, commune_id, starts_at, ends_at, sector, cause, description, source, source_url, external_id, reliability_score, confidence_score, time_precision")
    .in("status", ["resolved", "cancelled"])
    .not("ends_at", "is", null)
    .lt("ends_at", cutoff);

  if (toArchive && toArchive.length > 0) {
    const rows = toArchive.map((outage: any) => ({
      original_outage_id: outage.id,
      commune_id: outage.commune_id,
      sector: outage.sector,
      starts_at: outage.starts_at,
      ends_at: outage.ends_at,
      duration_minutes: Math.max(1, Math.round((new Date(outage.ends_at).getTime() - new Date(outage.starts_at).getTime()) / 60000)),
      cause: outage.cause,
      description: outage.description,
      source: outage.source,
      source_url: outage.source_url,
      external_id: outage.external_id,
      reliability_score: outage.reliability_score,
      confidence_score: outage.confidence_score,
      time_precision: outage.time_precision,
    }));
    const { error } = await supabaseAdmin.from("outage_history").upsert(rows, {
      onConflict: "external_id",
      ignoreDuplicates: false,
    });
    if (error) throw error;
  }

  const { data: deleted, error } = await supabaseAdmin
    .from("outages")
    .delete()
    .in("status", ["resolved", "cancelled"])
    .not("ends_at", "is", null)
    .lt("ends_at", cutoff)
    .select("id");
  if (error) throw error;

  return {
    ...((cleanupData as CleanupSummary | null) ?? {}),
    expiredArchived: Number(expiredArchived ?? 0),
    archived: toArchive?.length ?? 0,
    deleted: deleted?.length ?? 0,
  };
}
