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
  })).min(1).max(500),
});

/**
 * Endpoint webhook public pour ingestion de coupures (cron / scraper externe).
 * Sécurisation : header X-Ingest-Token doit matcher INGEST_WEBHOOK_TOKEN.
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
        const rows = parsed.data.items
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
          .upsert(rows, { onConflict: "source,external_id" });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

        return new Response(JSON.stringify({ ok: true, accepted: rows.length, skipped: parsed.data.items.length - rows.length }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      },
    },
  },
});