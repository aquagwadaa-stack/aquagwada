import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Scrape le planning hebdomadaire SMGEAG (tours d'eau) avec Firecrawl + IA.
 * Lancé chaque jour : SMGEAG ne publie pas toujours au même moment.
 * Insère dans `forecasts` (prévisions) avec confidence élevée.
 */

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

const PLANNING_URLS = [
  "https://www.smgeag.fr/informations-reseau/",
  "https://www.smgeag.fr/travaux-3/",
  "https://www.smgeag.fr/les-actualites/",
];

type CommuneRow = { id: string; name: string; slug: string };

type AIForecast = {
  commune_name: string;
  forecast_date: string; // YYYY-MM-DD
  window_start: string | null; // HH:MM
  window_end: string | null;
  expected_duration_minutes: number | null;
  basis: string;
  trend: "stable" | "rising" | "falling";
};

function normalizeTrend(trend: AIForecast["trend"] | string | null | undefined): "improving" | "stable" | "worsening" {
  if (trend === "rising" || trend === "worsening") return "worsening";
  if (trend === "falling" || trend === "improving") return "improving";
  return "stable";
}

function norm(s: string): string {
  if (typeof s !== "string" || !s) return "";
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function findCommuneId(name: string, communes: CommuneRow[]): string | null {
  if (!name) return null;
  const target = norm(name);
  if (!target) return null;
  for (const c of communes) if (norm(c.name) === target) return c.id;
  for (const c of communes) {
    const cn = norm(c.name);
    if (cn.length >= 4 && (target.includes(cn) || cn.includes(target))) return c.id;
  }
  return null;
}

async function firecrawlScrape(url: string): Promise<string | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY missing");
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) { console.warn(`[planning] scrape ${url} HTTP ${res.status}`); return null; }
  const json = await res.json() as { data?: { markdown?: string } };
  return json.data?.markdown ?? null;
}

async function extractForecasts(markdown: string, sourceUrl: string, communeNames: string[]): Promise<AIForecast[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const today = new Date().toISOString().slice(0, 10);
  const system = `Tu analyses la page officielle SMGEAG du planning hebdomadaire des tours d'eau / coupures programmées en Guadeloupe.
Aujourd'hui : ${today}.
Communes valides : ${communeNames.join(", ")}.

Extrais UNIQUEMENT les coupures FUTURES (à partir d'aujourd'hui) avec date précise.
- forecast_date : YYYY-MM-DD
- window_start / window_end : HH:MM (24h), null si toute la journée
- basis : courte phrase ("planning hebdomadaire SMGEAG", "travaux annoncés", "tour d'eau")
- trend : "stable" par défaut, "rising" si situation s'aggrave, "falling" si s'améliore
- expected_duration_minutes : durée prévue en minutes si déductible

Retourne TOUJOURS { "forecasts": [...] } même si vide.`;

  const user = `Source : ${sourceUrl}\n\n${markdown.slice(0, 12_000)}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) { console.warn(`[planning] AI HTTP ${res.status}`); return []; }
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as { forecasts?: AIForecast[] };
    return Array.isArray(parsed.forecasts) ? parsed.forecasts : [];
  } catch { return []; }
}

export async function scrapePlanning(): Promise<{ ok: boolean; pages: number; forecasts_extracted: number; inserted: number; updated: number; errors: number }> {
  const startedAt = new Date();
  const { data: communes, error: cErr } = await supabaseAdmin.from("communes").select("id, name, slug");
  if (cErr) throw cErr;
  const list = (communes ?? []) as CommuneRow[];
  const names = list.map((c) => c.name);

  let pagesOk = 0, totalExtracted = 0, inserted = 0, updated = 0, errors = 0;

  for (const url of PLANNING_URLS) {
    let md: string | null = null;
    try { md = await firecrawlScrape(url); }
    catch (e) { errors++; console.warn(`[planning] scrape error`, e); continue; }
    if (!md || md.length < 200) continue;
    pagesOk++;

    let items: AIForecast[] = [];
    try { items = await extractForecasts(md, url, names); }
    catch (e) { errors++; continue; }
    totalExtracted += items.length;

    for (const f of items) {
      const communeId = findCommuneId(f.commune_name, list);
      if (!communeId) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.forecast_date)) continue;

      // Upsert : (commune_id, forecast_date, window_start) considérés comme clé logique
      const { data: existing } = await supabaseAdmin
        .from("forecasts")
        .select("id")
        .eq("commune_id", communeId)
        .eq("forecast_date", f.forecast_date)
        .maybeSingle();

      const row = {
        commune_id: communeId,
        forecast_date: f.forecast_date,
        window_start: f.window_start,
        window_end: f.window_end,
        expected_duration_minutes: f.expected_duration_minutes,
        probability: 0.95, // planning officiel
        confidence: 0.95,
        trend: normalizeTrend(f.trend),
        basis: f.basis,
        sample_size: 1,
        day_of_week_signal: 0,
      };

      if (existing) {
        const { error } = await supabaseAdmin.from("forecasts").update(row).eq("id", existing.id);
        if (!error) updated++;
        else errors++;
      } else {
        const { error } = await supabaseAdmin.from("forecasts").insert(row);
        if (!error) inserted++;
        else errors++;
      }
    }
  }

  await supabaseAdmin.from("scraper_runs").insert({
    source: "smgeag-planning",
    url: PLANNING_URLS.join(","),
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    ok: errors === 0,
    items_found: totalExtracted,
    items_inserted: inserted,
    items_updated: updated,
    notes: `pages=${pagesOk} errors=${errors}`,
  });

  return { ok: errors === 0, pages: pagesOk, forecasts_extracted: totalExtracted, inserted, updated, errors };
}