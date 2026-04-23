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

/** Poids par source pour résolution de conflits de fiabilité. */
const SOURCE_WEIGHT: Record<string, number> = {
  official: 1.0,
  scraping: 0.7,
  user_report: 0.5,
  forecast: 0.4,
};

const MERGE_WINDOW_MIN = 30; // fenêtre pour considérer 2 coupures comme la même

/**
 * Endpoint webhook public pour ingestion de coupures (cron / scraper externe).
 * Sécurisation : header X-Ingest-Token doit matcher INGEST_WEBHOOK_TOKEN.
 * Comportement :
 *   - upsert sur (source, external_id) — déduplication exacte
 *   - merge intelligent : si une coupure existe déjà sur la même commune dans une
 *     fenêtre proche (±30 min), on garde la version avec la meilleure fiabilité
 *     pondérée et on enrichit les champs manquants.
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
        try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 }); }

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
        const errors: string[] = [];

        for (const i of validItems) {
          const commune_id = bySlug.get(i.commune_slug)!;
          const sourceWeight = SOURCE_WEIGHT[i.source] ?? 0.5;
          const effectiveScore = Math.min(1, i.reliability_score * sourceWeight * i.confidence_source_weight);
          const startsAt = new Date(i.starts_at);
          const windowStart = new Date(startsAt.getTime() - MERGE_WINDOW_MIN * 60_000).toISOString();
          const windowEnd = new Date(startsAt.getTime() + MERGE_WINDOW_MIN * 60_000).toISOString();

          // 1. Cherche un duplicata exact (source + external_id)
          const { data: existingExact } = await supabaseAdmin
            .from("outages")
            .select("id, reliability_score, ends_at, sector, cause, description")
            .eq("source", i.source)
            .eq("external_id", i.external_id)
            .maybeSingle();

          if (existingExact) {
            await supabaseAdmin.from("outages").update({
              starts_at: i.starts_at,
              ends_at: i.ends_at ?? existingExact.ends_at,
              estimated_duration_minutes: i.estimated_duration_minutes ?? null,
              status: i.status,
              reliability_score: effectiveScore,
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

          // 2. Cherche un voisin proche (même commune, fenêtre ±30 min)
          const { data: neighbors } = await supabaseAdmin
            .from("outages")
            .select("id, reliability_score, sector, cause, description, ends_at")
            .eq("commune_id", commune_id)
            .gte("starts_at", windowStart)
            .lte("starts_at", windowEnd)
            .neq("status", "cancelled")
            .limit(1);

          const neighbor = neighbors?.[0];
          if (neighbor) {
            // Garde la meilleure fiabilité, enrichit les champs manquants
            if (effectiveScore > Number(neighbor.reliability_score)) {
              await supabaseAdmin.from("outages").update({
                starts_at: i.starts_at,
                ends_at: i.ends_at ?? neighbor.ends_at,
                estimated_duration_minutes: i.estimated_duration_minutes ?? null,
                status: i.status,
                source: i.source,
                reliability_score: effectiveScore,
                confidence_score: i.confidence_score,
                time_precision: i.time_precision,
                is_estimated: i.is_estimated,
                confidence_source_weight: i.confidence_source_weight,
                external_id: i.external_id,
                sector: i.sector ?? neighbor.sector,
                cause: i.cause ?? neighbor.cause,
                description: i.description ?? neighbor.description,
                source_url: i.source_url ?? null,
              }).eq("id", neighbor.id);
            } else {
              // Enrichit seulement
              await supabaseAdmin.from("outages").update({
                ends_at: neighbor.ends_at ?? i.ends_at ?? null,
                sector: neighbor.sector ?? i.sector ?? null,
                cause: neighbor.cause ?? i.cause ?? null,
                description: neighbor.description ?? i.description ?? null,
              }).eq("id", neighbor.id);
            }
            merged++;
            continue;
          }

          // 3. Insertion neuve
          const { error: insErr } = await supabaseAdmin.from("outages").insert({
            commune_id,
            sector: i.sector ?? null,
            starts_at: i.starts_at,
            ends_at: i.ends_at ?? null,
            estimated_duration_minutes: i.estimated_duration_minutes ?? null,
            status: i.status,
            source: i.source,
            reliability_score: effectiveScore,
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
          skipped: parsed.data.items.length - validItems.length,
          errors: errors.slice(0, 10),
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  },
});