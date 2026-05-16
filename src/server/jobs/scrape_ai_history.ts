import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Construit l'historique des coupures d'eau en Guadeloupe.
 *
 * Pipeline :
 *  1. Firecrawl /search → trouve les pages contenant "coupure d'eau Guadeloupe", presse, SMGEAG, etc.
 *  2. Firecrawl /scrape → récupère le markdown complet de chaque page (limité)
 *  3. Lovable AI (Gemini 2.5 Flash) → extrait JSON structuré (commune, date, durée, cause)
 *  4. Insère dans `outage_history` avec déduplication par external_id
 *  5. Logge dans `scraper_runs`
 */

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const SEARCH_QUERIES = [
  "coupure eau SMGEAG Guadeloupe",
  "coupure eau Guadeloupe France-Antilles",
  "tour d'eau SMGEAG",
  "perturbation distribution eau Guadeloupe",
  "travaux SMGEAG Guadeloupe",
  "site:smgeag.fr coupure",
  "site:smgeag.fr travaux",
  "site:franceantilles.fr coupure eau Guadeloupe",
  "site:rci.fm coupure eau Guadeloupe",
  "site:karibinfo.com eau Guadeloupe",
  "site:facebook.com SMGEAG coupure eau Guadeloupe",
  "site:facebook.com Guadeloupe coupure eau",
  "site:facebook.com Guadeloupe tour d'eau",
];

type CommuneRow = { id: string; name: string; slug: string };

type AIOutage = {
  commune_name: string;
  starts_at: string; // ISO
  ends_at: string | null;
  duration_minutes: number | null;
  cause: string | null;
  description: string;
  sector: string | null;
  time_precision: "exact" | "approximate";
};

function norm(s: string): string {
  if (typeof s !== "string" || !s) return "";
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function hashId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) { h = ((h << 5) - h + input.charCodeAt(i)) | 0; }
  return `aih_${(h >>> 0).toString(36)}`;
}

function numberFromEnv(name: string, fallback: number, min = 1, max = 100): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function aiHistoryQueries(): string[] {
  const extra = (process.env.AI_HISTORY_EXTRA_QUERIES ?? "")
    .split("\n")
    .flatMap((line) => line.split("|"))
    .map((line) => line.trim())
    .filter(Boolean);
  return Array.from(new Set([...SEARCH_QUERIES, ...extra]));
}

function lovableHistoryModels(): string[] {
  const configured = process.env.AI_HISTORY_AI_MODELS || process.env.PLANNING_AI_MODELS || process.env.PLANNING_AI_MODEL || "";
  const models = configured.split(",").map((m) => m.trim()).filter(Boolean);
  if (models.length) return models;
  return ["google/gemini-2.5-flash", "google/gemini-2.5-pro"];
}

function directGeminiHistoryModels(): string[] {
  const configured = process.env.GEMINI_AI_MODELS || process.env.GEMINI_MODEL || "";
  const models = configured.split(",").map((m) => m.trim().replace(/^google\//, "")).filter(Boolean);
  if (models.length) return models;
  return ["gemini-2.5-flash", "gemini-2.5-pro"];
}

function isLovableCreditError(message: string): boolean {
  return /HTTP 402|payment_required|not enough credits/i.test(message);
}

async function sourceAlreadyImported(url: string): Promise<boolean> {
  const [history, outages] = await Promise.all([
    supabaseAdmin.from("outage_history").select("id", { count: "exact", head: true }).eq("source_url", url),
    supabaseAdmin.from("outages").select("id", { count: "exact", head: true }).eq("source_url", url),
  ]);
  return ((history.count ?? 0) + (outages.count ?? 0)) > 0;
}

async function firecrawlSearch(query: string, limit = 10): Promise<Array<{ url: string; title?: string; description?: string; markdown?: string }>> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY missing");
  const res = await fetch(`${FIRECRAWL_BASE}/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit,
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.warn(`[ai-history] search "${query}" HTTP ${res.status}: ${txt.slice(0, 200)}`);
    return [];
  }
  const json = await res.json() as { data?: { web?: Array<{ url: string; title?: string; description?: string; markdown?: string }> } };
  return json.data?.web ?? [];
}

function buildFallbackHistoryPrompt(markdown: string, sourceUrl: string, communeNames: string[]) {
  const systemPrompt = `Tu es un expert en analyse d'articles de presse et communiques officiels concernant les coupures d'eau en Guadeloupe (SMGEAG).
Ta mission : extraire UNIQUEMENT les coupures d'eau reelles (passees ou en cours) mentionnees dans le texte.

Communes valides en Guadeloupe : ${communeNames.join(", ")}.

Regles strictes :
- Ignore les annonces purement futures sans date precise
- Ignore les articles generiques sans coupure datee
- Pour chaque coupure : identifie la commune EXACTE (depuis la liste), la date de debut (ISO 8601), la fin si connue
- Si l'heure n'est pas precise, mets time_precision="approximate" et starts_at a 00:00 du jour
- Cause possible : "fuite", "travaux", "maintenance", "reparation", "tour d'eau", "rupture", "panne", "casse", null si inconnu
- description : phrase courte (max 300 chars) resumant l'incident
- sector : quartier/section si mentionne, sinon null
- duration_minutes : si deductible, sinon null
- Retourne TOUJOURS un objet JSON { "outages": [...] } meme si vide`;

  const userPrompt = `Source : ${sourceUrl}\n\nContenu :\n${markdown.slice(0, 12_000)}`;
  return { systemPrompt, userPrompt };
}

async function callLovableHistoryAI(model: string, markdown: string, sourceUrl: string, communeNames: string[]): Promise<AIOutage[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const { systemPrompt, userPrompt } = buildFallbackHistoryPrompt(markdown, sourceUrl, communeNames);

  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Lovable AI ${model} HTTP ${res.status}: ${txt.slice(0, 220)}`);
  }
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Lovable AI ${model} empty response`);
  try {
    const parsed = JSON.parse(content) as { outages?: AIOutage[] };
    return Array.isArray(parsed.outages) ? parsed.outages : [];
  } catch {
    return [];
  }
}

async function callDirectGeminiHistoryAI(model: string, markdown: string, sourceUrl: string, communeNames: string[]): Promise<AIOutage[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const { systemPrompt, userPrompt } = buildFallbackHistoryPrompt(markdown, sourceUrl, communeNames);

  const res = await fetch(`${GEMINI_API_URL}/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini ${model} HTTP ${res.status}: ${txt.slice(0, 220)}`);
  }
  const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const content = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();
  if (!content) throw new Error(`Gemini ${model} empty response`);
  try {
    const parsed = JSON.parse(content) as { outages?: AIOutage[] };
    return Array.isArray(parsed.outages) ? parsed.outages : [];
  } catch {
    return [];
  }
}

async function callAIWithFallback(markdown: string, sourceUrl: string, communeNames: string[]): Promise<AIOutage[]> {
  const errors: string[] = [];

  if (process.env.LOVABLE_API_KEY) {
    for (const model of lovableHistoryModels()) {
      try {
        const outages = await callLovableHistoryAI(model, markdown, sourceUrl, communeNames);
        if (outages.length > 0) return outages;
        errors.push(`Lovable AI ${model} returned 0 outage`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push(message);
        if (isLovableCreditError(message)) break;
      }
    }
  } else {
    errors.push("Lovable AI skipped: LOVABLE_API_KEY missing");
  }

  if (process.env.GEMINI_API_KEY) {
    for (const model of directGeminiHistoryModels()) {
      try {
        const outages = await callDirectGeminiHistoryAI(model, markdown, sourceUrl, communeNames);
        if (outages.length > 0) return outages;
        errors.push(`Gemini ${model} returned 0 outage`);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  } else {
    errors.push("Direct Gemini skipped: GEMINI_API_KEY missing");
  }

  console.warn(`[ai-history] AI extraction returned no outage: ${errors.join(" | ").slice(0, 1000)}`);
  return [];
}

function findCommuneId(name: string, communes: CommuneRow[]): string | null {
  if (!name) return null;
  const target = norm(name);
  if (!target) return null;
  for (const c of communes) {
    if (norm(c.name) === target) return c.id;
  }
  // tolérance : inclusion
  for (const c of communes) {
    const cn = norm(c.name);
    if (cn.length >= 4 && (target.includes(cn) || cn.includes(target))) return c.id;
  }
  return null;
}

function findCommuneIdsInText(text: string, communes: CommuneRow[]): string[] {
  const haystack = norm(text);
  return communes
    .filter((c) => {
      const cn = norm(c.name);
      return cn.length >= 4 && haystack.includes(cn);
    })
    .map((c) => c.id);
}

export async function scrapeAIHistory(): Promise<{ ok: boolean; pages_scanned: number; outages_extracted: number; inserted: number; skipped: number; skipped_existing: number; errors: number }> {
  const startedAt = new Date();
  const { data: communes, error: cErr } = await supabaseAdmin.from("communes").select("id, name, slug");
  if (cErr) throw cErr;
  const list = (communes ?? []) as CommuneRow[];
  const communeNames = list.map((c) => c.name);
  const maxPages = numberFromEnv("AI_HISTORY_MAX_PAGES_PER_RUN", 18, 1, 80);
  const searchLimit = numberFromEnv("AI_HISTORY_SEARCH_LIMIT_PER_QUERY", 5, 1, 20);

  let pagesScanned = 0;
  let outagesExtracted = 0;
  let inserted = 0;
  let skipped = 0;
  let skippedExisting = 0;
  let errors = 0;

  const seenUrls = new Set<string>();

  for (const query of aiHistoryQueries()) {
    if (pagesScanned >= maxPages) break;
    let results: Array<{ url: string; title?: string; description?: string; markdown?: string }> = [];
    try { results = await firecrawlSearch(query, searchLimit); }
    catch (e) { errors++; console.warn(`[ai-history] search error`, e); continue; }

    for (const r of results) {
      if (pagesScanned >= maxPages) break;
      if (!r.url || seenUrls.has(r.url)) continue;
      seenUrls.add(r.url);
      if (await sourceAlreadyImported(r.url)) {
        skippedExisting++;
        continue;
      }
      const md = r.markdown ?? "";
      if (md.length < 200) { skipped++; continue; }

      pagesScanned++;

      let aiResults: AIOutage[] = [];
      try { aiResults = await callAIWithFallback(md, r.url, communeNames); }
      catch (e) { errors++; console.warn(`[ai-history] AI error`, e); continue; }

      outagesExtracted += aiResults.length;

      for (const out of aiResults) {
        const communeIds = findCommuneId(out.commune_name, list)
          ? [findCommuneId(out.commune_name, list)!]
          : findCommuneIdsInText(`${out.commune_name} ${out.description} ${md.slice(0, 2000)}`, list);
        if (communeIds.length === 0) { skipped++; continue; }
        const startsAt = new Date(out.starts_at);
        if (Number.isNaN(startsAt.getTime())) { skipped++; continue; }

        for (const communeId of communeIds) {
        const externalId = hashId(`${communeId}|${startsAt.toISOString().slice(0, 16)}|${out.description.slice(0, 60)}`);

        // Dédup
        const { data: existing } = await supabaseAdmin
          .from("outage_history")
          .select("id")
          .eq("external_id", externalId)
          .maybeSingle();
        if (existing) { skipped++; continue; }

        const parsedEnd = out.ends_at ? new Date(out.ends_at) : null;
        const endsAt = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : null;
        const duration = out.duration_minutes ?? (endsAt ? Math.round((endsAt.getTime() - startsAt.getTime()) / 60000) : 180);
        const safeEnd = endsAt ?? new Date(startsAt.getTime() + Math.max(1, duration) * 60_000);

        const { error } = await supabaseAdmin.from("outage_history").insert({
          commune_id: communeId,
          source: "scraping",
          source_url: r.url,
          external_id: externalId,
          starts_at: startsAt.toISOString(),
          ends_at: safeEnd.toISOString(),
          duration_minutes: Math.max(1, duration),
          description: out.description.slice(0, 500),
          cause: out.cause,
          sector: out.sector,
          reliability_score: 0.85,
          confidence_score: out.time_precision === "exact" ? 0.9 : 0.7,
          time_precision: out.time_precision,
        });
        if (error) { errors++; console.warn(`[ai-history] insert error`, error.message); }
        else { inserted++; }
        }
      }
    }
  }

  await supabaseAdmin.from("scraper_runs").insert({
    source: "ai-history",
    url: "firecrawl+gemini",
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    ok: errors === 0,
    items_found: outagesExtracted,
    items_inserted: inserted,
    items_updated: 0,
    notes: `pages=${pagesScanned} skipped=${skipped} skippedExisting=${skippedExisting} maxPages=${maxPages} searchLimit=${searchLimit} errors=${errors}`,
  });

  return { ok: errors === 0, pages_scanned: pagesScanned, outages_extracted: outagesExtracted, inserted, skipped, skipped_existing: skippedExisting, errors };
}
