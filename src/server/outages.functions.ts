import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Endpoint d'ingestion (à appeler par cron ou scrapers).
 * Insère ou met à jour des coupures par (source, external_id).
 */
const IngestSchema = z.object({
  items: z.array(z.object({
    commune_slug: z.string().min(1).max(80),
    sector: z.string().max(200).nullable().optional(),
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime().nullable().optional(),
    estimated_duration_minutes: z.number().int().min(1).max(60 * 72).nullable().optional(),
    status: z.enum(["scheduled","ongoing","resolved","cancelled"]).default("scheduled"),
    source: z.enum(["official","scraping","user_report","forecast"]).default("scraping"),
    reliability_score: z.number().min(0).max(1).default(0.7),
    cause: z.string().max(500).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    source_url: z.string().url().max(500).nullable().optional(),
    external_id: z.string().max(200),
  })).min(1).max(500),
});

export const ingestOutages = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IngestSchema.parse(input))
  .handler(async ({ data }) => {
    const slugs = Array.from(new Set(data.items.map((i) => i.commune_slug)));
    const { data: communes, error: cErr } = await supabaseAdmin
      .from("communes").select("id, slug").in("slug", slugs);
    if (cErr) return { ok: false, error: cErr.message, inserted: 0 };
    const bySlug = new Map((communes ?? []).map((c) => [c.slug, c.id]));

    const rows = data.items
      .filter((i) => bySlug.has(i.commune_slug))
      .map((i) => ({
        commune_id: bySlug.get(i.commune_slug)!,
        sector: i.sector ?? null,
        starts_at: i.starts_at,
        ends_at: i.ends_at ?? null,
        estimated_duration_minutes: i.estimated_duration_minutes ?? null,
        status: i.status,
        source: i.source,
        reliability_score: i.reliability_score,
        cause: i.cause ?? null,
        description: i.description ?? null,
        source_url: i.source_url ?? null,
        external_id: i.external_id,
      }));

    const { error } = await supabaseAdmin
      .from("outages")
      .upsert(rows, { onConflict: "source,external_id", ignoreDuplicates: false });

    if (error) return { ok: false, error: error.message, inserted: 0 };
    return { ok: true, inserted: rows.length };
  });

/** Statistiques publiques agrégées. */
export const getStats = createServerFn({ method: "GET" }).handler(async () => {
  const nowIso = new Date().toISOString();
  const { data: ongoing } = await supabaseAdmin
    .from("outages").select("id", { count: "exact", head: true })
    .lte("starts_at", nowIso)
    .or(`ends_at.gte.${nowIso},ends_at.is.null`)
    .eq("status", "ongoing");

  const { data: communes } = await supabaseAdmin
    .from("communes").select("id", { count: "exact", head: true });

  return {
    ongoing_count: (ongoing as any)?.length ?? 0,
    communes_count: (communes as any)?.length ?? 0,
  };
});