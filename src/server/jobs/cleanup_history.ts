import { supabaseAdmin } from "@/integrations/supabase/client.server";

type CleanupSummary = {
  normalized_outages?: number;
  normalized_history?: number;
  deduped_outages?: number;
  deduped_history?: number;
  deduped_forecasts?: number;
};

export async function cleanupHistory(): Promise<CleanupSummary & { archived: number; deleted: number; expiredArchived: number; expiredTrials: number; warnings?: string[] }> {
  const warnings: string[] = [];
  const { data: cleanupData, error: cleanupError } = await (supabaseAdmin as any).rpc("cleanup_outage_data");
  if (cleanupError) warnings.push(`cleanup_outage_data: ${cleanupError.message}`);

  const { data: expiredArchived, error: expiredError } = await (supabaseAdmin as any).rpc("archive_expired_outages");
  if (expiredError) warnings.push(`archive_expired_outages: ${expiredError.message}`);

  const { data: expiredTrials, error: trialsError } = await (supabaseAdmin as any).rpc("expire_overdue_trials");
  if (trialsError) warnings.push(`expire_overdue_trials: ${trialsError.message}`);

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
    const rowsByExternalId = new Map<string, (typeof rows)[number]>();
    const archiveRows = rows.filter((row) => {
      if (!row.external_id) return true;
      if (rowsByExternalId.has(row.external_id)) return false;
      rowsByExternalId.set(row.external_id, row);
      return false;
    });
    archiveRows.push(...rowsByExternalId.values());

    const { error } = await supabaseAdmin.from("outage_history").upsert(archiveRows, {
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
    expiredTrials: Number(expiredTrials ?? 0),
    archived: toArchive?.length ?? 0,
    deleted: deleted?.length ?? 0,
    ...(warnings.length ? { warnings } : {}),
  };
}
