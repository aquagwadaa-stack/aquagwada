import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const IngestSchema = z.object({
  items: z.array(z.object({
    commune_slug: z.string().min(1).max(80),
    sector: z.string().max(200).nullable().optional(),
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime().nullable().optional(),
    estimated_duration_minutes: z.number().int().min(1).max(60 * 72).nullable().optional(),
    status: z.enum(["scheduled", "ongoing", "resolved", "cancelled"]).default("scheduled"),
    source: z.enum(["official", "scraping", "user_report", "forecast"]).default("scraping"),
    reliability_score: z.number().min(0).max(1).default(0.7),
    cause: z.string().max(500).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    source_url: z.string().url().max(500).nullable().optional(),
    external_id: z.string().max(200),
    time_precision: z.enum(["exact", "approximate", "day_only"]).default("exact"),
    is_estimated: z.boolean().default(false),
    confidence_score: z.number().min(0).max(1).default(0.8),
    confidence_source_weight: z.number().min(0).max(1).default(1),
  })).min(1).max(500),
});

/**
 * Hiérarchie stricte des sources : official écrase tout, scraping écrase user_report,
 * user_report n'override jamais une source plus fiable. Une source de rang inférieur
 * peut SEULEMENT enrichir les champs manquants.
 */
const SOURCE_RANK: Record<string, number> = {
  official: 4,
  scraping: 2,
  user_report: 1,
  forecast: 0,
};

const NEAR_WINDOW_MIN = 30; // recherche initiale de candidats à fusionner

function rankOf(src: string): number {
  return SOURCE_RANK[src] ?? 0;
}

/**
 * Décide si deux coupures (existante "n" et entrante "i") doivent être fusionnées.
 * Critères :
 *   1. Même secteur si les deux ont un secteur renseigné → exigé que ce soit le même
 *      (sinon ce sont 2 coupures distinctes proches : on ne fusionne pas).
 *   2. Overlap temporel direct OU starts_at à moins de 30 min.
 */
function shouldMerge(
  n: { starts_at: string; ends_at: string | null; sector: string | null },
  i: { starts_at: string; ends_at?: string | null; sector?: string | null; estimated_duration_minutes?: number | null },
): boolean {
  // Désaccord secteur explicite → ne pas fusionner
  if (n.sector && i.sector && n.sector.trim().toLowerCase() !== i.sector.trim().toLowerCase()) {
    return false;
  }
  const nStart = new Date(n.starts_at).getTime();
  const nEnd = n.ends_at ? new Date(n.ends_at).getTime() : nStart + 2 * 3600_000;
  const iStart = new Date(i.starts_at).getTime();
  const iEnd = i.ends_at
    ? new Date(i.ends_at).getTime()
    : iStart + (i.estimated_duration_minutes ?? 120) * 60_000;

  // Overlap temporel
  if (iStart <= nEnd && iEnd >= nStart) return true;

  // Proximité starts_at
  if (Math.abs(iStart - nStart) <= NEAR_WINDOW_MIN * 60_000) return true;

  return false;
}

/**
 * Endpoint webhook public pour ingestion de coupures (cron / scraper externe).
 * Sécurisation : header X-Ingest-Token doit matcher INGEST_WEBHOOK_TOKEN.
 *
 * Règles de résolution de conflit (priorité stricte) :
 *   - official > scraping > user_report
 *   - Une source de rang inférieur n'écrase jamais une source de rang supérieur ;
 *     elle peut uniquement enrichir des champs vides (sector, cause, description, ends_at).
 *   - Si même rang, la dernière reçue prend précédence pour les champs temporels.
 */
export const Route = createFileRoute("/api/public/outages/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-ingest-token");
        const expected = process.env.INGEST_WEBHOOK_TOKEN;
        if (!expected || !token || token !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
        }

        let body: unknown;
        try { body = await request.json(); } catch {
          return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 });
        }

        const parsed = IngestSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "invalid payload", details: parsed.error.flatten() }), { status: 400, headers: { "content-type": "application/json" } });
        }

        const slugs = Array.from(new Set(parsed.data.items.map((i) => i.commune_slug)));
        const { data: communes, error: cErr } = await supabaseAdmin
          .from("communes").select("id, slug").in("slug", slugs);
        if (cErr) return new Response(JSON.stringify({ error: cErr.message }), { status: 500 });

        const bySlug = new Map((communes ?? []).map((c) => [c.slug, c.id]));
        const validItems = parsed.data.items.filter((i) => bySlug.has(i.commune_slug));

        let merged = 0;
        let inserted = 0;
        let enriched = 0;
        let skipped_lower_priority = 0;
        const errors: string[] = [];

        for (const i of validItems) {
          const commune_id = bySlug.get(i.commune_slug)!;
          const incomingRank = rankOf(i.source);
          const startsAt = new Date(i.starts_at);
          const windowStart = new Date(startsAt.getTime() - NEAR_WINDOW_MIN * 60_000).toISOString();
          // Élargir la borne sup pour capturer aussi les coupures dont starts_at est avant
          // mais qui se chevauchent encore dans le temps (overlap pur).
          const lookbackHours = 6;
          const overlapWindowStart = new Date(startsAt.getTime() - lookbackHours * 3600_000).toISOString();
          const windowEnd = new Date(startsAt.getTime() + NEAR_WINDOW_MIN * 60_000).toISOString();

          // 1. Doublon exact (source + external_id) → toujours mettre à jour la même entrée
          const { data: existingExact } = await supabaseAdmin
            .from("outages")
            .select("id, source, reliability_score, ends_at, sector, cause, description")
            .eq("source", i.source)
            .eq("external_id", i.external_id)
            .maybeSingle();

          if (existingExact) {
            await supabaseAdmin.from("outages").update({
              starts_at: i.starts_at,
              ends_at: i.ends_at ?? existingExact.ends_at,
              estimated_duration_minutes: i.estimated_duration_minutes ?? null,
              status: i.status,
              reliability_score: i.reliability_score,
              confidence_score: i.confidence_score,
              time_precision: i.time_precision,
              is_estimated: i.is_estimated,
              confidence_source_weight: i.confidence_source_weight,
              sector: i.sector ?? existingExact.sector,
              cause: i.cause ?? existingExact.cause,
              description: i.description ?? existingExact.description,
              source_url: i.source_url ?? null,
            }).eq("id", existingExact.id);
            merged++;
            continue;
          }

          // 2. Cherche candidats voisins (overlap large + starts_at proche)
          const { data: candidates } = await supabaseAdmin
            .from("outages")
            .select("id, source, reliability_score, sector, cause, description, ends_at, starts_at")
            .eq("commune_id", commune_id)
            .gte("starts_at", overlapWindowStart)
            .lte("starts_at", windowEnd)
            .neq("status", "cancelled")
            .order("starts_at", { ascending: false })
            .limit(10);

          // Filtre : conserve uniquement les vrais candidats à fusion (overlap ou proximité, secteur compatible)
          const mergeable = (candidates ?? []).find((n: any) => shouldMerge(n, i));

          if (mergeable) {
            const existingRank = rankOf(mergeable.source as string);

            if (incomingRank > existingRank) {
              // Source plus fiable → override complet, mais ne perd jamais l'info connue (ends_at, etc.)
              await supabaseAdmin.from("outages").update({
                starts_at: i.starts_at,
                ends_at: i.ends_at ?? mergeable.ends_at,
                estimated_duration_minutes: i.estimated_duration_minutes ?? null,
                status: i.status,
                source: i.source,
                reliability_score: i.reliability_score,
                confidence_score: i.confidence_score,
                time_precision: i.time_precision,
                is_estimated: i.is_estimated,
                confidence_source_weight: i.confidence_source_weight,
                external_id: i.external_id,
                sector: i.sector ?? mergeable.sector,
                cause: i.cause ?? mergeable.cause,
                description: i.description ?? mergeable.description,
                source_url: i.source_url ?? null,
              }).eq("id", mergeable.id);
              merged++;
            } else if (incomingRank === existingRank) {
              // Même rang : enrichit + met à jour si plus récent
              await supabaseAdmin.from("outages").update({
                starts_at: i.starts_at,
                ends_at: i.ends_at ?? mergeable.ends_at,
                estimated_duration_minutes: i.estimated_duration_minutes ?? null,
                status: i.status,
                reliability_score: Math.max(Number(mergeable.reliability_score), i.reliability_score),
                confidence_score: i.confidence_score,
                sector: mergeable.sector ?? i.sector ?? null,
                cause: mergeable.cause ?? i.cause ?? null,
                description: mergeable.description ?? i.description ?? null,
              }).eq("id", mergeable.id);
              merged++;
            } else {
              // Rang inférieur : N'OVERRIDE PAS. Enrichit uniquement les champs vides.
              const patch: {
                ends_at?: string;
                sector?: string;
                cause?: string;
                description?: string;
              } = {};
              if (!mergeable.ends_at && i.ends_at) patch.ends_at = i.ends_at;
              if (!mergeable.sector && i.sector) patch.sector = i.sector;
              if (!mergeable.cause && i.cause) patch.cause = i.cause;
              if (!mergeable.description && i.description) patch.description = i.description;

              if (Object.keys(patch).length > 0) {
                await supabaseAdmin.from("outages").update(patch).eq("id", mergeable.id);
                enriched++;
              } else {
                skipped_lower_priority++;
              }
            }
            continue;
          }

          // 3. Aucun voisin → insertion neuve
          const { error: insErr } = await supabaseAdmin.from("outages").insert({
            commune_id,
            sector: i.sector ?? null,
            starts_at: i.starts_at,
            ends_at: i.ends_at ?? null,
            estimated_duration_minutes: i.estimated_duration_minutes ?? null,
            status: i.status,
            source: i.source,
            reliability_score: i.reliability_score,
            confidence_score: i.confidence_score,
            time_precision: i.time_precision,
            is_estimated: i.is_estimated,
            confidence_source_weight: i.confidence_source_weight,
            cause: i.cause ?? null,
            description: i.description ?? null,
            source_url: i.source_url ?? null,
            external_id: i.external_id,
          });
          if (insErr) errors.push(insErr.message);
          else inserted++;
        }

        return new Response(JSON.stringify({
          ok: true,
          inserted,
          merged,
          enriched,
          skipped_lower_priority,
          skipped_unknown_commune: parsed.data.items.length - validItems.length,
          errors: errors.slice(0, 10),
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  },
});
